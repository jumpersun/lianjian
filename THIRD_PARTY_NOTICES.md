# Third-party notices

## Exercise text and metadata

- Source: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
- Pinned revision: `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`
- Source file: `data/exercises.json`
- Source SHA-256: `656634224b8977b99a6d765470ee123260d4979715eaa4e7c0b7c8bb0d79f93d`
- Copyright (c) 2026 Hasan Emir Yıldırım.
- License: MIT for code, tooling, dataset structure and instruction text/translations, with an explicit exception for media. Original notices are preserved in [licenses/exercises-dataset-LICENSE](licenses/exercises-dataset-LICENSE) and [licenses/exercises-dataset-NOTICE.md](licenses/exercises-dataset-NOTICE.md).

`public/data/exercises.json` is a derived text/metadata dataset: English and Chinese instructions retained, other translations and creation timestamps removed. It contains 1,324 records. `scripts/prepare-data.mjs` reproduces it from the exact upstream JSON; it never downloads or copies media. The application adds local Chinese names, product-level difficulty tags and a documented category correction in `src/data/` without altering upstream attribution.

## Exercise media is NOT included

The original illustrations and animations are © Gym visual — https://gymvisual.com/ and are **not** covered by the data's MIT license. Media filename and attribution fields are preserved only as metadata for optional user-supplied assets and backup compatibility. They do not grant rights to the files.

This repository contains no Gym visual images or GIFs, does not fetch them, and defaults to text-only teaching. The upstream author's permission must not be assumed to apply to this project or its users. Obtain the rights required for your particular deployment before enabling media. Purchasing a standard asset license does not necessarily authorize public source redistribution. See [Gym visual's terms](https://gymvisual.com/content/3-terms-and-conditions-of-use) and seek written clarification where needed, including for AI-related deployments.

Do not contribute third-party exercise media without documented redistribution permission. Removing a watermark, attribution or filename does not resolve licensing. The license for Lianjian's code does not supersede these restrictions.

## Software dependencies

React, React DOM, Vite, the Vite React plugin and their transitive dependencies retain their own licenses, distributed with the packages resolved by `package-lock.json`.
