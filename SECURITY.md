# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub's
["Report a vulnerability"](https://github.com/kashishparmar02/OmniDev/security/advisories/new)
form. Do not open a public issue. You can expect a first reply within a week.

## If a secret is committed

Treat the secret as compromised from the moment it is pushed, even if the
commit is later removed. Hosting platforms keep old commits reachable through
pull request references and caches.

1. Revoke or rotate the secret first.
2. Then remove it from the repository.
3. Report it using the form above so the history can be checked.
