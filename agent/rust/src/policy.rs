use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct PolicyException {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub fingerprints: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DlpPolicy {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub priority: i32,
    pub action: String,
    #[serde(default)]
    pub min_severity: String,
    #[serde(default)]
    pub min_risk_score: u8,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub fingerprints: Vec<String>,
    #[serde(default)]
    pub exceptions: Vec<PolicyException>,
    #[serde(default)]
    pub share_redacted_preview: bool,
}

#[derive(Debug, Deserialize)]
pub struct PolicyBundle {
    #[serde(default)]
    pub policies: Vec<DlpPolicy>,
    #[serde(default)]
    pub fail_closed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PolicyDecision {
    pub action: String,
    pub policy_id: Option<String>,
    pub policy_name: Option<String>,
    pub reason: String,
    pub share_redacted_preview: bool,
}

fn severity_rank(value: &str) -> u8 {
    match value {
        "low" => 1,
        "medium" => 2,
        "high" => 3,
        "critical" => 4,
        _ => 0,
    }
}

fn exception_matches(
    exception: &PolicyException,
    provider: &str,
    extension: &str,
    categories: &[String],
    fingerprint: &str,
) -> bool {
    let mut has_condition = false;

    if !exception.categories.is_empty() {
        has_condition = true;
        if !exception
            .categories
            .iter()
            .any(|wanted| categories.iter().any(|found| found == wanted))
        {
            return false;
        }
    }

    if !exception.providers.is_empty() {
        has_condition = true;
        if !exception.providers.iter().any(|wanted| wanted == provider) {
            return false;
        }
    }

    if !exception.extensions.is_empty() {
        has_condition = true;
        if !exception.extensions.iter().any(|wanted| {
            wanted
                .trim_start_matches('.')
                .eq_ignore_ascii_case(extension)
        }) {
            return false;
        }
    }
    if !exception.fingerprints.is_empty() {
        has_condition = true;
        if !exception
            .fingerprints
            .iter()
            .any(|wanted| wanted.eq_ignore_ascii_case(fingerprint))
        {
            return false;
        }
    }

    has_condition
}

fn policy_matches(
    policy: &DlpPolicy,
    provider: &str,
    extension: &str,
    severity: &str,
    risk_score: u8,
    categories: &[String],
    fingerprint: &str,
) -> bool {
    if !policy.enabled || !matches!(policy.action.as_str(), "block" | "audit" | "allow") {
        return false;
    }
    if !policy.min_severity.is_empty()
        && severity_rank(severity) < severity_rank(&policy.min_severity)
    {
        return false;
    }
    if risk_score < policy.min_risk_score {
        return false;
    }
    if !policy.categories.is_empty()
        && !policy
            .categories
            .iter()
            .any(|wanted| categories.iter().any(|found| found == wanted))
    {
        return false;
    }
    if !policy.providers.is_empty() && !policy.providers.iter().any(|wanted| wanted == provider) {
        return false;
    }
    if !policy.extensions.is_empty()
        && !policy.extensions.iter().any(|wanted| {
            wanted
                .trim_start_matches('.')
                .eq_ignore_ascii_case(extension)
        })
    {
        return false;
    }
    if !policy.fingerprints.is_empty()
        && !policy
            .fingerprints
            .iter()
            .any(|wanted| wanted.eq_ignore_ascii_case(fingerprint))
    {
        return false;
    }
    true
}

pub fn evaluate(
    bundle: &PolicyBundle,
    provider: &str,
    extension: &str,
    fingerprint: &str,
    inspection_complete: bool,
    severity: &str,
    risk_score: u8,
    categories: &[String],
) -> PolicyDecision {
    if !inspection_complete && bundle.fail_closed {
        return PolicyDecision {
            action: "block".into(),
            policy_id: None,
            policy_name: None,
            reason: "inspection_failed_fail_closed".into(),
            share_redacted_preview: false,
        };
    }

    let mut ordered = bundle
        .policies
        .iter()
        .filter(|item| item.enabled)
        .collect::<Vec<_>>();
    ordered.sort_by_key(|item| item.priority);
    for item in ordered {
        if policy_matches(
            item,
            provider,
            extension,
            severity,
            risk_score,
            categories,
            fingerprint,
        ) {
            if let Some(exception) = item.exceptions.iter().find(|exception| {
                exception_matches(exception, provider, extension, categories, fingerprint)
            }) {
                let exception_action = if exception.action.is_empty() {
                    "allow"
                } else {
                    exception.action.as_str()
                };
                return PolicyDecision {
                    action: exception_action.to_owned(),
                    policy_id: Some(item.id.clone()),
                    policy_name: Some(item.name.clone()),
                    reason: format!("matched_exception:{}:{}", item.id, exception.name),
                    share_redacted_preview: item.share_redacted_preview
                        && exception_action != "block",
                };
            }
            return PolicyDecision {
                action: item.action.clone(),
                policy_id: Some(item.id.clone()),
                policy_name: Some(item.name.clone()),
                reason: format!("matched_policy:{}", item.id),
                share_redacted_preview: item.share_redacted_preview,
            };
        }
    }

    PolicyDecision {
        action: "allow".into(),
        policy_id: None,
        policy_name: None,
        reason: if inspection_complete {
            "no_policy_match"
        } else {
            "inspection_incomplete_fail_open"
        }
        .into(),
        share_redacted_preview: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(action: &str, priority: i32) -> DlpPolicy {
        DlpPolicy {
            id: format!("policy-{priority}"),
            name: "Sensitive credential".into(),
            enabled: true,
            priority,
            action: action.into(),
            min_severity: "high".into(),
            min_risk_score: 70,
            categories: vec!["cloud_credential".into()],
            providers: vec!["chatgpt".into()],
            extensions: vec!["pdf".into()],
            fingerprints: vec![],
            exceptions: vec![],
            share_redacted_preview: false,
        }
    }

    #[test]
    fn first_matching_priority_decides() {
        let bundle = PolicyBundle {
            policies: vec![policy("allow", 20), policy("block", 10)],
            fail_closed: true,
        };
        let decision = evaluate(
            &bundle,
            "chatgpt",
            "pdf",
            "",
            true,
            "critical",
            100,
            &["cloud_credential".into()],
        );
        assert_eq!(decision.action, "block");
        assert_eq!(decision.policy_id.as_deref(), Some("policy-10"));
    }

    #[test]
    fn provider_and_file_constraints_are_applied() {
        let bundle = PolicyBundle {
            policies: vec![policy("block", 10)],
            fail_closed: true,
        };
        let decision = evaluate(
            &bundle,
            "claude",
            "pdf",
            "",
            true,
            "critical",
            100,
            &["cloud_credential".into()],
        );
        assert_eq!(decision.action, "allow");
    }

    #[test]
    fn matching_exception_exempts_a_policy() {
        let mut block = policy("block", 10);
        block.exceptions = vec![PolicyException {
            name: "approved workspace".into(),
            action: "allow".into(),
            categories: vec![],
            providers: vec!["chatgpt".into()],
            extensions: vec![],
            fingerprints: vec![],
        }];
        let bundle = PolicyBundle {
            policies: vec![block],
            fail_closed: true,
        };
        let decision = evaluate(
            &bundle,
            "chatgpt",
            "pdf",
            "",
            true,
            "critical",
            100,
            &["cloud_credential".into()],
        );
        assert_eq!(decision.action, "allow");
        assert!(decision.reason.starts_with("matched_exception:policy-10:"));
    }

    #[test]
    fn exception_requires_all_configured_dimensions_to_match() {
        let mut block = policy("block", 10);
        block.extensions = vec!["pdf".into(), "xlsx".into()];
        block.exceptions = vec![PolicyException {
            name: "approved spreadsheet".into(),
            action: "allow".into(),
            categories: vec!["email".into()],
            providers: vec!["chatgpt".into()],
            extensions: vec!["xlsx".into()],
            fingerprints: vec![],
        }];
        let bundle = PolicyBundle {
            policies: vec![block],
            fail_closed: true,
        };

        let incomplete_exception_match = evaluate(
            &bundle,
            "chatgpt",
            "pdf",
            "",
            true,
            "critical",
            100,
            &["email".into(), "cloud_credential".into()],
        );
        assert_eq!(incomplete_exception_match.action, "block");

        let full_exception_match = evaluate(
            &bundle,
            "chatgpt",
            "xlsx",
            "",
            true,
            "critical",
            100,
            &["email".into(), "cloud_credential".into()],
        );
        assert_eq!(full_exception_match.action, "allow");
    }

    #[test]
    fn failed_inspection_is_blocked_when_fail_closed() {
        let bundle = PolicyBundle {
            policies: vec![],
            fail_closed: true,
        };
        let decision = evaluate(&bundle, "chatgpt", "pdf", "", false, "none", 0, &[]);
        assert_eq!(decision.action, "block");
        assert_eq!(decision.reason, "inspection_failed_fail_closed");
    }
}

#[cfg(test)]
mod fingerprint_tests {
    use super::*;

    #[test]
    fn exact_file_fingerprint_can_be_blocked() {
        let policy = DlpPolicy {
            id: "known-confidential-file".into(),
            name: "Known confidential file".into(),
            enabled: true,
            priority: 1,
            action: "block".into(),
            min_severity: "none".into(),
            min_risk_score: 0,
            categories: vec![],
            providers: vec![],
            extensions: vec![],
            fingerprints: vec![
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
            ],
            exceptions: vec![],
            share_redacted_preview: false,
        };
        let bundle = PolicyBundle {
            policies: vec![policy],
            fail_closed: true,
        };
        let decision = evaluate(
            &bundle,
            "chatgpt",
            "pdf",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            true,
            "none",
            0,
            &[],
        );
        assert_eq!(decision.action, "block");
    }
}
