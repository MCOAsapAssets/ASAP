# ASAP Assets

Client briefs for the four ASAP cubes: Small Business, Marketing, Creators and Personalised.

- `dist/html/`: the online briefs, ready to upload
- `dist/word/`: Word versions of the same questions
- `apps-script/Code.gs`: sends online briefs to the ASAP Client Briefs Google Sheet
- `src/`: the questions (`src/briefs/`) and shared page code; rebuild with `node build.js`

Setup steps: [SETUP.md](SETUP.md)

## Client engine skill

`.claude/skills/asap-client-engine/` builds and updates each client's profile: goal, viewer, voice, facts, pillars, a weekly content mix with variety built in, guardrails, results and the direction for the next burst. The concept engine (`asap-concept-shoot-engine`) reads the profile to make each burst.

It loads automatically in Claude Code sessions on this repo. To use it in claude.ai alongside the concept engine, upload `asap-client-engine.zip` under Settings → Capabilities → Skills.
