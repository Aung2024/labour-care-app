# Project Learnings

- **[context]** This isolated voucher branch must use only Firebase project `labourcare-2481a` and must never deploy functions, rules, indexes, scripts, or data changes to the MOH project `mnch-1cbda`.
- **[context]** Voucher issuance and redemption require internet; existing clinical care workflows remain offline-capable.
- **[constraint]** While the project remains on Spark, Firebase Auth account creation, deletion, login changes, and password resets are performed manually in Firebase Console.
