use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct PolicyException {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
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
) -> bool {
    (!exception.categories.is_empty()
        && exception
            .categories
            .iter()
            .any(|wanted| categories.iter().any(|found| found == wanted)))
        || (!exception.providers.is_empty()
            && exception.providers.iter().any(|wanted| wanted == provider))
        || (!exception.extensions.is_empty()
            && exception.extensions.iter().any(|wanted| {
                wanted
                    .trim_start_matches('.')
                    .eq_ignore_ascii_case(extension)
            }))
}

fn policy_matches(
    policy: &DlpPolicy,
    provider: &str,
    extension: &str,
    severity: &str,
    risk_score: u8,
    categories: &[String],
) -> bool {
    if !policy.enabled || !matches!(policy.action.as_str(), "block" | "audit" | "allow") {
        return false;
    }
    if policy
        .exceptions
        .iter()
        .any(|exception| exception_matches(exception, provider, extension, categories))
    {
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
    true
}

pub fn evaluate(
    bundle: &PolicyBundle,
    provider: &str,
    extension: &str,
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
        if policy_matches(item, provider, extension, severity, risk_score, categories) {
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
            name: "Approved provider exception".into(),
            categories: vec![],
            providers: vec!["chatgpt".into()],
            extensions: vec![],
        }];
        let bundle = PolicyBundle {
            policies: vec![block],
            fail_closed: true,
        };
        let decision = evaluate(
            &bundle,
            "chatgpt",
            "pdf",
            true,
            "critical",
            100,
            &["cloud_credential".into()],
        );
        assert_eq!(decision.action, "allow");
        assert_eq!(decision.reason, "no_policy_match");
    }

    #[test]
    fn failed_inspection_is_blocked_when_fail_closed() {
        let bundle = PolicyBundle {
            policies: vec![],
            fail_closed: true,
        };
        let decision = evaluate(&bundle, "chatgpt", "pdf", false, "none", 0, &[]);
        assert_eq!(decision.action, "block");
        assert_eq!(decision.reason, "inspection_failed_fail_closed");
    }
}
