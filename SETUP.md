# Setting up the ASAP client briefs

There are four briefs, one per cube. Each comes in two versions:

| Brief | Online version (send the link) | Word version (attach to an email) |
|---|---|---|
| Small Business | `dist/html/asap-brief-small-business.html` | `dist/word/ASAP Small Business Brief.docx` and `ASAP Small Business Brief (Shoot Day).docx` |
| Marketing | `dist/html/asap-brief-marketing.html` | `dist/word/ASAP Marketing Brief.docx` |
| Creators | `dist/html/asap-brief-creators.html` | `dist/word/ASAP Creator Brief.docx` |
| Personalised | `dist/html/asap-brief-personalised.html` | `dist/word/ASAP Personalised Brief.docx` |

The online briefs save the client's answers on their device as they go. When they press **Send to ASAP**, the answers go to a Google Sheet and you get an email. Until step 2 below is done, clients get a "Copy my answers" button and paste their answers into an email to agency@asapassets.com.au instead. So the briefs already work today, just less smoothly.

---

## 1. Make the Google Sheet and script (about 10 minutes, once)

1. Sign in to the Google account you want the briefs saved in. Create a new Google Sheet called **ASAP Client Briefs**.
2. In the sheet, go to **Extensions → Apps Script**.
3. Delete everything in the editor, paste in the whole of `apps-script/Code.gs`, and click **Save**.
4. In the function dropdown at the top, pick **testSetup** and click **Run**.
   - Google asks for permission. Click **Review permissions**, choose your account, then **Advanced → Go to (project name) (unsafe)** → **Allow**. This warning shows for every private script. It's your own script, so it's safe.
   - Check that the sheet now has a **Test** tab, and that agency@asapassets.com.au got a "New Test" email. Then delete the Test tab.
5. Click **Deploy → New deployment**. Click the cog and pick **Web app**:
   - Description: `ASAP briefs`
   - Execute as: **Me**
   - Who has access: **Anyone**. This lets clients send a brief without a Google login. They can only add a row; they can't see the sheet.
6. Click **Deploy** and copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends in `/exec`.

## 2. Connect the briefs to the sheet

Send Claude the Web app URL and it will connect and rebuild all four briefs. Or do it yourself:

- Paste the URL into `config.json` (`"scriptUrl": "https://script.google.com/macros/s/.../exec"`) and run `node build.js`.
- **Or**, without the build: open each file in `dist/html/` in a text editor, find `var SCRIPT_URL = "";` and paste the URL between the quotes.

Each brief gets its own tab in the sheet (SMB Brief, Marketing Brief, Creator Brief, Personalised Brief), with one row per client and one column per question.

## 3. Put the briefs on the website

Upload the four HTML files to the website and give them clean addresses. Suggested:

| Address | File | Send to |
|---|---|---|
| `asapassets.com.au/brief` | asap-brief-small-business.html | Small Business Base and Middle clients |
| `asapassets.com.au/brief#shoot` | (same file) | Small Business Premium clients (shoot-day questions) |
| `asapassets.com.au/brief/marketing` | asap-brief-marketing.html | Marketing Strategy, ASAP Agency and Custom Retainer clients |
| `asapassets.com.au/brief/creators` | asap-brief-creators.html | Creator plan clients |
| `asapassets.com.au/brief/personalised` | asap-brief-personalised.html | Shoots, AI and website enquiries |

Each file is self-contained, so any host that can serve an HTML page will work. The pages are set to `noindex`, so they won't show up in Google, and they aren't linked from the site menu.

Then test each brief from your phone: fill in your own details, press **Send to ASAP**, and check that the row and the email arrive.

## 4. Privacy policy

Add a line to the privacy policy's "tools we use": *Google Sheets, for storing the answers clients send in their brief.*

---

## Changing questions later

The questions live in `src/briefs/` (one file per brief). Edit the wording there, then run `node build.js`. That rebuilds the online briefs and the Word versions together, so they always match. The shared look and behaviour are in `src/template-head.html` and `src/engine.js`.

- **Optional follow-ups** ("Got more to say?") are the `extras` list on each question.
- **`required: true`** means the client can't skip that question. It's used for the main goal (question 1) and the filming schedule on every brief, and for posting frequency on Creators.
- **`when`** shows a question only for certain picks. For example, the videographer question only shows for Custom Retainer clients.

If you change `apps-script/Code.gs`, paste it into the Apps Script editor again. Then go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.
