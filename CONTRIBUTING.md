# Contributing

Keep content inspection local and control-plane events metadata-only. Never add raw file text, prompts, clipboard contents, matched secrets, or credentials to logs, events, fixtures, or tests.

Distinguish observed, inspected, transmitted, and prevented states. Do not infer a successful leak or prevention. Keep provider-specific browser logic in adapters. Validate untrusted input and apply strict size/time limits.

Pull requests must describe scope, security/privacy impact, tests executed, and known limitations. Never include production credentials or real customer data.
