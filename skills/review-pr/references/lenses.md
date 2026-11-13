# Review lenses

Go through each lens for the code the pull request changes. A lens is a list of
questions to ask, not a list of findings to produce. Most questions will have
the answer "this is fine", and that answer is not reported.

## Correctness

- What happens with empty, null, zero, negative and very large inputs?
- Are both ends of every range and loop right, or is one off by one?
- If a call in the middle fails, what state is left behind?
- Does the change handle the case where two requests run at the same time?
- Are errors handled where they can be acted on, or swallowed and hidden?
- Did the change alter behaviour that an existing caller depends on?

## Security

Report a security finding only when you can name where the untrusted value
enters and the line where it does harm.

- Does input from a user, a file or another service reach a query, a shell
  command, a file path, a URL or HTML without being validated or escaped?
- Is every new endpoint or action checked for both who the caller is and
  whether they may touch this particular record?
- Are secrets, tokens or personal data written to logs, errors or responses?
- Does a new dependency or a version change bring in known problems?
- Is a comparison of secrets done in constant time, and is randomness taken
  from a secure source where it protects something?

## Performance

Report a performance finding only when you can say how often the code runs and
how the cost grows.

- Is there a query or a network call inside a loop over a list that can grow?
- Does the change load a whole table, file or result set where it needs a part?
- Is work repeated on every request that could be done once?
- Did a new field become part of a filter or a sort without an index?
- Does anything block a request thread or the event loop while it waits?

## SQL and data

- Can a migration lock a large table for writes while it runs?
- Is a new column added as NOT NULL without a default on a table with rows?
- Does a migration have a way back, and is the data change repeatable?
- Does a new query filter on columns that an existing index covers?
- Can an UPDATE or DELETE affect more rows than intended if a condition is
  missing or a parameter is null?
- Are related writes inside one transaction, and are transactions kept short?

## Tests

- Does a test fail if the new behaviour is removed?
- Are the error path and the boundary cases tested, or only the usual path?
- Does a test assert on the result, or only that nothing was thrown?
- Is anything mocked so heavily that the test no longer exercises the change?
