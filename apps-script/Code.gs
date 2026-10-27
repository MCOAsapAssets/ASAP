/**
 * ASAP Client Briefs
 * Receives every online brief (Small Business, Marketing, Creators, Personalised) and files it
 * in this Google Sheet, one tab per brief, one row per client. Also emails the team a copy.
 * Setup steps are in SETUP.md.
 */
var NOTIFY = "agency@asapassets.com.au";
var BASE = ["Received", "Business", "Name", "Contact"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    // The briefs have a hidden field only bots fill in. Say thanks and drop it.
    if (data.website) return reply({ ok: true });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tab = String(data.form || "Brief").replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 90);
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);
    var fields = data.fields || [];

    // Columns follow the questions. New or reworded questions get a new column on the end,
    // so older rows never shift.
    var header = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    BASE.concat(fields.map(function (f) { return f[0]; }), ["Full brief"]).forEach(function (h) {
      if (header.indexOf(h) < 0) header.push(h);
    });
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold").setWrap(true);
    sheet.setFrozenRows(1);

    var values = { Received: new Date(), Business: data.business, Name: data.name, Contact: data.contact, "Full brief": data.text };
    fields.forEach(function (f) { values[f[0]] = f[1]; });
    sheet.appendRow(header.map(function (h) { return clean(values[h]); }));

    MailApp.sendEmail({
      to: NOTIFY,
      subject: "New " + tab + ": " + (data.business || "unnamed"),
      body: (data.text || "") + "\n\n---\nAll briefs: " + ss.getUrl()
    });
    return reply({ ok: true });
  } catch (err) {
    console.error(err);
    return reply({ ok: false });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app URL in a browser shows this, so you can check it's live.
function doGet() {
  return ContentService.createTextOutput("ASAP brief inbox is running.");
}

// Run this once from the editor to approve permissions and send a test row and email.
function testSetup() {
  var out = doPost({ postData: { contents: JSON.stringify({
    form: "Test", business: "Test business", name: "Matt", contact: NOTIFY,
    fields: [["What does your business do, in one sentence?", "Testing the brief inbox."]],
    text: "ASAP CLIENT BRIEF: TEST\nThis is a test. Delete the Test tab when you're done."
  }) } });
  console.log(out.getContent());
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Keeps answers as plain text: anything starting with = + - @ would otherwise run as a formula.
function clean(v) {
  if (v == null) return "";
  if (v instanceof Date) return v;
  v = String(v).slice(0, 49000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
