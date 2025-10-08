
1. Read `CLAUDE.md`
2. Read additional _docs_ to get better context:
   1. `[api-svc-01-overview.md](../docs/api-svc/api-svc-01-overview.md)`
   2. `[api-svc-07-control-agent.md](../docs/api-svc/api-svc-07-control-agent.md)`
3. Read Jira ticket CSI-1864: https://infitx-technologies.atlassian.net/jira/software/c/projects/CSI/boards/12/backlog?assignee=712020%3A5680aa00-ab49-4175-96be-384e78ebaa45&selectedIssue=CSI-1864
   1. Analyze description, check Acceptance Criteria. If not able to access Jira, see the `Jira Details` section below
   2. Understand the problem we want to solve in scope of the story, identify which components need to be added/modified.
   3. Check in huge detail actual code implementation of involved components, understand how related logic works now.
   4. Ask any clarification if needed!
4. Create high-level implementation plan, split on tasks, suggest testing plan (with test cases for new logic)
5. One of my junior colleague provided me detailed implementation plan for the story: `/home/eugen/projects/ML/sdk-scheme-adapter/_cc/specs/story-CSI-1864-plan.md`:
   1. Analyze it, and give your feedback how to improve and/or optimize that plan
   2. Compare your high-level plan with that one, come up with suggestion how to combine there two plans into one final plan
   3. Suggestion from my side how to improve colleague's plan:
      1. For polling, try to reuse `controlClient` which we already use for listening to `ControlAgent.EVENT.RECONFIGURE` event instead of creating new one
      2. Pass this `controlClient` to `_startConfigPolling()` or access `this.controlClient` inside it
   4. Suggest any changes you think needed, and ask my approval!
   5. Store final plan in `/home/eugen/projects/ML/sdk-scheme-adapter/_cc/specs/story-CSI-1864-final-plan.md`
6. Ask me to review your final plan, before any code changes!   
7. Update `CLAUDE.md` and `api-svc-07-control-agent.md` with new changes details

## Jira Details

### Story description:
```
Implement Failsafe Mechanism in SDK to Poll Configuration Changes from Management API
This problem results in transactions failing through that connection, which can be a DFSP connection, or a proxy connection to another scheme. I.e. if this occurs in a proxy, then in the current configuration all transaction will fail. There have been numerous attempts to fix the stale certificate sdk problem, yet the problem perisists. This story is about taking a new approach that will elimitate this problem.

Currently, the SDK Scheme Adapter relies on notifications from the Management API to update its configuration — for example, when new participant certificates or JWS keys are updated.
However, in some cases these notifications may not be delivered reliably (due to network issues, restarts, or transient errors), which can lead to JWS desynchronization between the SDK and the Management Service.

To address this, introduce a failsafe polling mechanism within the SDK that periodically polls the Management API for configuration updates. This ensures that even if event-driven updates fail, the SDK eventually synchronizes its configuration.
```

## Acceptance Criteria:
1. The SDK includes a background polling mechanism that periodically checks for configuration updates from the Management API.
2. Polling frequency is configurable through an environment variable, e.g. MANAGEMENT_API_POLL_INTERVAL_MS.
3. If no interval is configured, the failsafe polling feature is disabled (default behavior).
4. When polling is enabled, the SDK should:
   1. Fetch and compare the configuration with the current state.
   2. Apply updates if changes are detected.
   3. Log both successful updates and polling errors with clear messages.
5. The implementation must not cause race conditions with live notifications — if both notification and polling update the config simultaneously, the state remains consistent.
6. Unit tests added to validate:
