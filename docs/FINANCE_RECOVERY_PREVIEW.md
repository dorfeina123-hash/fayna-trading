# Financial recovery preview

Entry points: Financial management → Check expenses and restore; or Settings →
Data and backup → Financial → Check expenses and restore.

The center reads the current, successfully loaded account's four financial source
arrays and their date ranges. File selection validates and displays a preview;
it does not apply a merge. The preview distinguishes additions, identical records,
same-ID conflicts and notes. Existing records/notes win conflicts. Up to 40 changed
rows are shown, with totals covering all rows. Amounts are raw stored values before
currency conversion, clearly labeled as such.

Applying requires an explicit button, the same authenticated/loaded UID and an
unchanged local finance fingerprint. Changed data requires a new preview. Account
switch/logout closes and erases the dialogs. A current-state backup is exported
before the existing additive restore path runs. Invalid/cancelled previews and
all-identical backups do not write. No trading arrays, prices or payment state
are changed.

Only browser-local protection copies with a known owner UID matching the current
session are offered. Unknown/foreign copies are excluded, including their contents;
no ownership is inferred from the UID that happened to request snapshot creation.
There is no automatic historical cloud recovery and no claim that the owner's
reported missing expenses have been found. Production account investigation still
requires authenticated access to the original account/device and source examples.

Validation: Node recovery/sync tests and offline browser interaction tests cover
read-only inventory/preview, same-ID conflict preservation, identical-row handling,
missing-note counts, owner scoping, text-only rendering of malicious content,
cancellation, local changes during review, backup-before-save ordering, identity
switch cleanup and dark/light layouts at 1440/390/320 pixels. Browser tests use
fictional data and stub persistence; they are not a live production data restore.

Limit: the fingerprint prevents changes within this client during preview. Legacy
cloud writes remain unversioned, so this is not a server-wide concurrent editing
lock. Before recovering real records, preserve available copies and verify the
latest cloud/device state. Account-level withdrawals remain in trading backups.
