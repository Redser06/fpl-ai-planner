# Builder directives

## Definition of done
A feature is done only when its client call site exists and has been exercised end-to-end.
A Cloud Function with no caller is dead code, not a feature. Before marking anything ✅ in
the README status table, grep src/ for the call site.
(Failure that caused this: importSquad shipped with zero client code.)

## No decorative interactions
No rendered element may imply an action without a wired handler. Every alert carrying
actionLabel/replacementId must have an onApply path, or the label must not render.
(Failure: the "one-click fix" shipped as a static text box.)

## Legal recommendations only
Any suggested transfer must pass validateSquad with full context — bank, club limit,
position quotas — before surfacing.
(Failure: findReplacement ignored bank and the club limit.)

## Comments describe what exists
Ship the feature or cut the sentence. No comments or README text describing planned
functionality as if it were live.

## Freshness is part of the feature
If the product serves stale data unless a human runs a local command, the feature is
incomplete. Every data-consuming feature needs its refresh mechanism in the same change.

## Privileged callables are allowlisted
Any function that triggers ingest, deploys, or costs money checks request.auth.uid against
the ADMIN_UIDS allowlist. Authentication is not authorisation.
