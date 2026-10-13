# CLAUDE.md

Working rules for Claude in this repository. They apply until new findings change them.

## Project

Home Assistant dashboard card for machines bridged by
[leva2mqtt](https://github.com/stangster-360/leva2mqtt). TypeScript + Lit, one bundle
`dist/leva2mqtt-customcard.js` (the name HACS expects), distributed through HACS.

## Language

- Replies to the owner: German, direct and short.
- Everything in the repository is English: code, comments, commit messages, docs.

## Rules

- No code from the Leva Companion; it is copyrighted.
- The card only talks to Home Assistant (states, services, recorder). It never talks to
  the bridge or the machine directly.
- Missing entities are left out, never an error.
- Mark assumptions about the bridge or the machine as unverified until a capture confirms
  them, as in the bridge repository.

## Git

- Commit and push to `main` when it makes sense. Run `npm run typecheck`, `npm test` and
  `npm run build` first. `dist/` is not committed; releases carry the bundle.
