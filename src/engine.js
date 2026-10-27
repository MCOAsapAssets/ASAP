(function () {
  "use strict";

  /* ---------- the brief ---------- */
  // Briefs with a shoot-day version (Small Business): send clients the normal link if they film themselves.
  // Add #shoot to the end of the link for clients with an ASAP shoot day, e.g. asapassets.com.au/brief#shoot
  var SHOOT = /^#?shoot$/i.test(location.hash || "");
  /*@@BRIEF@@*/
  var SECTIONS = Object.assign({ intro: BRIEF.intro.side || "Your Brief", review: "Check & Send", done: "Thank You" }, BRIEF.sections);
  var SECTION_ORDER = BRIEF.order;
  var STEPS = [{ id: "intro", sec: "intro", type: "intro" }]
    .concat(BRIEF.steps)
    .concat([{ id: "review", sec: "review", type: "review" }, { id: "done", sec: "done", type: "done" }]);
  var META = BRIEF.meta || [];
  var EMAIL = "agency@asapassets.com.au";

  /* ---------- state ---------- */
  var KEY = BRIEF.key;
  var state = { step: 0, a: {}, open: {}, submitted: null };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved && saved.a) state = Object.assign(state, saved); } catch (e) {}
  if (state.step >= STEPS.length || STEPS[state.step].type === "done") state.step = state.submitted ? STEPS.length - 1 : 0;
  var saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 250); }

  /* ---------- settings ----------
     SCRIPT_URL: paste the Google Apps Script "Web app URL" between the quotes.
     FORM_NAME: becomes the tab name in the ASAP Client Briefs sheet. */
  var SCRIPT_URL = "/*@@SCRIPT_URL@@*/";
  var FORM_NAME = BRIEF.form;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function autosize(t) { t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }
  function toast(msg) {
    var t = el("div", { class: "toast", role: "status", text: msg });
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function copyText(text) {
    var done = function () { toast("Copied"); };
    try {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); });
    } catch (e) { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = el("textarea", { class: "area", readonly: "readonly", "aria-label": "Your answers" });
    ta.value = text; ta.style.minHeight = "200px";
    var box = $("copyBox"); if (box) { box.innerHTML = ""; box.appendChild(el("p", { class: "hint", text: "Copy didn't work here, so the text is selected below. Copy it with your keyboard or long-press." })); box.appendChild(ta); }
    ta.focus(); ta.select();
  }
  // Lines with {email} get the ASAP email dropped in as a selectable span.
  function withEmail(line) {
    var parts = line.split("{email}");
    var kids = [parts[0]];
    for (var i = 1; i < parts.length; i++) { kids.push(el("span", { class: "email", text: EMAIL })); kids.push(parts[i]); }
    return kids;
  }

  /* answer access */
  function val(id) { return state.a[id]; }
  function setVal(id, v) { state.a[id] = v; save(); updateNav(); }
  function rowsOf(step) {
    var r = val(step.id);
    if (!Array.isArray(r) || !r.length) { r = []; for (var i = 0; i < step.start; i++) r.push({}); state.a[step.id] = r; }
    return r;
  }
  function filled(step) {
    var v = val(step.id);
    if (step.type === "text") return !!(v && String(v).trim());
    if (step.type === "fields") return !!v && step.fields.some(function (f) { return v[f[0]] && v[f[0]].trim(); });
    if (step.type === "rows") return Array.isArray(v) && v.some(function (r) { return Object.keys(r).some(function (k) { return r[k] && String(r[k]).trim(); }); });
    if (step.type === "chips") return !!v && ((v.pick && v.pick.length) || (v.text && v.text.trim()));
    return true;
  }

  /* questions that only show for certain picks, e.g. { step: "need", any: ["Website"] } */
  function active(step) {
    if (!step.when) return true;
    var pick = (val(step.when.step) || {}).pick || [];
    return step.when.any.some(function (o) { return pick.indexOf(o) >= 0; });
  }
  function questions() { return STEPS.filter(function (s) { return s.q && active(s); }); }
  function sections() { var qs = questions(); return SECTION_ORDER.filter(function (sec) { return qs.some(function (q) { return q.sec === sec; }); }); }

  /* ---------- left panel ---------- */
  (function buildCube() {
    var shades = ["#262626", "#3a3a3a", "#4f4f4f", "#6a6a6a", "#8a8a8a", "#a9a9a9", "#c6c6c6"];
    var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var cube = $("cube");
    ["front", "back", "right", "left", "top", "bottom"].forEach(function (f) {
      var face = el("div", { class: "face f-" + f });
      for (var i = 0; i < 9; i++) { var s = el("span"); s.style.setProperty("--c", shades[Math.floor(rnd() * shades.length)]); face.appendChild(s); }
      cube.appendChild(face);
    });
  })();

  /* ---------- render ---------- */
  var navBtn;
  // Counts change as soon as a pick shows or hides questions, so this runs on every answer too.
  function counts() {
    var step = STEPS[state.step];
    var secs = sections();
    var si = secs.indexOf(step.sec);
    $("secNo").textContent = si >= 0 ? String(si + 1).padStart(2, "0") + " / " + String(secs.length).padStart(2, "0") : "";
    var qs = questions();
    var qi = qs.indexOf(step);
    $("counter").textContent = qi >= 0 ? String(qi + 1).padStart(2, "0") + " / " + qs.length : (step.type === "review" ? "Review" : "");
    var pct = step.type === "intro" ? 0 : qi >= 0 ? (qi / qs.length) * 100 : 100;
    $("bar").style.width = pct + "%";
  }

  function render(focus) {
    var step = STEPS[state.step];
    $("secTitle").textContent = SECTIONS[step.sec];
    counts();

    var card = $("card");
    card.innerHTML = "";
    card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter");

    var build = { intro: renderIntro, text: renderText, fields: renderFields, rows: renderRows, chips: renderChips, review: renderReview, done: renderDone }[step.type];
    build(card, step);
    if (step.extras) card.appendChild(renderExtras(step));
    if (step.type !== "done") card.appendChild(renderNav(step));
    updateNav();
    document.querySelectorAll("#card .area").forEach(autosize);
    $("main").scrollTop = 0;
    if (focus !== false && window.matchMedia("(min-width: 761px)").matches) {
      var first = card.querySelector(".area, .input, .chip");
      if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
    save();
  }

  function head(card, step) {
    card.appendChild(el("p", { class: "eyebrow", text: SECTIONS[step.sec] }));
    card.appendChild(el("h2", { class: "q", id: "q-" + step.id, text: step.q }));
    if (step.hint) card.appendChild(el("p", { class: "hint", text: step.hint }));
    if (step.required) card.appendChild(el("p", { class: "must", text: BRIEF.mustText || "We need this one to plan your content" }));
  }

  function textarea(id, ph, labelledby, getter, setter) {
    var t = el("textarea", { class: "area", id: id, rows: "2", placeholder: ph || "", "aria-labelledby": labelledby });
    t.value = getter() || "";
    t.addEventListener("input", function () { setter(t.value); autosize(t); });
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); next(); } });
    return t;
  }

  function renderIntro(card) {
    card.appendChild(el("p", { class: "eyebrow", text: "Before we start" }));
    card.appendChild(el("h2", { class: "q", text: BRIEF.intro.title }));
    card.appendChild(el("div", { class: "copy" }, BRIEF.intro.lines.map(function (l) { return el("p", {}, withEmail(l)); })));
    var v = val("intro") || {};
    var grid = el("div", { class: "fields" });
    BRIEF.intro.fields.forEach(function (f) {
      var inp = el("input", { class: "input", id: "intro-" + f[0], placeholder: f[2], autocomplete: f[3], type: "text" });
      inp.value = v[f[0]] || "";
      inp.addEventListener("input", function () { var o = Object.assign({}, val("intro") || {}); o[f[0]] = inp.value; setVal("intro", o); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); next(); } });
      grid.appendChild(el("div", { class: "field" }, [el("label", { for: "intro-" + f[0], text: f[1] }), inp]));
    });
    var trap = el("input", { type: "text", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", style: "position:absolute;left:-9999px;width:1px;height:1px;opacity:0" });
    trap.addEventListener("input", function () { var o = Object.assign({}, val("intro") || {}); o.website = trap.value; setVal("intro", o); });
    grid.appendChild(trap);
    card.appendChild(grid);
    if (state.submitted) card.appendChild(el("div", { class: "note" }, [el("p", { text: "You've already sent this brief. You can update any answer and send it again." })]));
  }

  function renderText(card, step) {
    head(card, step);
    card.appendChild(textarea("a-" + step.id, step.ph, "q-" + step.id, function () { return val(step.id); }, function (v) { setVal(step.id, v); }));
  }

  function renderFields(card, step) {
    head(card, step);
    var v = val(step.id) || {};
    var grid = el("div", { class: "fields" });
    step.fields.forEach(function (f) {
      var inp = el("input", { class: "input", id: step.id + "-" + f[0], placeholder: f[2], type: "text" });
      inp.value = v[f[0]] || "";
      inp.addEventListener("input", function () { var o = Object.assign({}, val(step.id) || {}); o[f[0]] = inp.value; setVal(step.id, o); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); next(); } });
      grid.appendChild(el("div", { class: "field" }, [el("label", { for: step.id + "-" + f[0], text: f[1] }), inp]));
    });
    card.appendChild(grid);
  }

  function renderRows(card, step) {
    head(card, step);
    var wrap = el("div", { class: "rows", role: "group", "aria-labelledby": "q-" + step.id });
    var tmpl = step.cols.map(function (c) { return c[3]; }).join(" ") + " 22px";
    var hd = el("div", { class: "row head" }, step.cols.map(function (c) { return el("span", { text: c[1] }); }).concat([el("span")]));
    hd.style.gridTemplateColumns = tmpl;
    wrap.appendChild(hd);
    function draw() {
      wrap.querySelectorAll(".row:not(.head)").forEach(function (n) { n.remove(); });
      var rows = rowsOf(step);
      rows.forEach(function (r, ri) {
        var row = el("div", { class: "row" });
        row.style.gridTemplateColumns = tmpl;
        step.cols.forEach(function (c) {
          var ctl;
          var aria = c[1] + ", line " + (ri + 1);
          if (c[4]) {
            ctl = el("select", { id: step.id + "-" + ri + "-" + c[0], "aria-label": aria });
            ctl.appendChild(el("option", { value: "", text: "Choose" }));
            c[4].forEach(function (o) { ctl.appendChild(el("option", { value: o, text: o })); });
            ctl.value = r[c[0]] || "";
            ctl.addEventListener("change", function () { rows[ri][c[0]] = ctl.value; setVal(step.id, rows); });
          } else {
            ctl = el("input", { class: "input", type: "text", id: step.id + "-" + ri + "-" + c[0], "aria-label": aria, placeholder: ri === 0 ? c[2] : "", inputmode: c[0] === "price" ? "decimal" : null });
            ctl.value = r[c[0]] || "";
            ctl.addEventListener("input", function () { rows[ri][c[0]] = ctl.value; setVal(step.id, rows); });
          }
          row.appendChild(ctl);
        });
        var rm = el("button", { class: "rm", type: "button", "aria-label": "Remove line " + (ri + 1), text: "×", onclick: function () {
          rows.splice(ri, 1); if (!rows.length) rows.push({}); setVal(step.id, rows); draw();
        } });
        row.appendChild(rm);
        wrap.insertBefore(row, addBtn);
      });
    }
    var addBtn = el("button", { class: "linkbtn addrow", type: "button", text: "+ " + step.add, onclick: function () {
      var rows = rowsOf(step); rows.push({}); setVal(step.id, rows); draw();
      var last = wrap.querySelectorAll(".row:not(.head)"); var f = last[last.length - 1].querySelector("input, select"); if (f) f.focus();
    } });
    wrap.appendChild(addBtn);
    draw();
    card.appendChild(wrap);
  }

  function renderChips(card, step) {
    head(card, step);
    var v = val(step.id) || { pick: [], text: "" };
    var box = el("div", { class: "chips", role: "group", "aria-labelledby": "q-" + step.id });
    step.options.forEach(function (o) {
      var on = v.pick.indexOf(o) >= 0;
      var b = el("button", { class: "chip", type: "button", "aria-pressed": on ? "true" : "false", text: o, onclick: function () {
        var cur = Object.assign({ pick: [], text: "" }, val(step.id) || {});
        var pick = cur.pick.slice();
        var i = pick.indexOf(o);
        if (i >= 0) pick.splice(i, 1);
        else if (!step.multi) pick = [o];
        else { pick.push(o); if (step.max && pick.length > step.max) pick.shift(); }
        cur.pick = pick; setVal(step.id, cur);
        box.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", pick.indexOf(c.textContent) >= 0 ? "true" : "false"); });
      } });
      box.appendChild(b);
    });
    card.appendChild(box);
    if (step.text) {
      var lab = el("label", { for: "a-" + step.id, id: "l-" + step.id, text: step.text[0] });
      var t = textarea("a-" + step.id, step.text[1], "l-" + step.id, function () { return (val(step.id) || {}).text; }, function (x) {
        var cur = Object.assign({ pick: [], text: "" }, val(step.id) || {}); cur.text = x; setVal(step.id, cur);
      });
      card.appendChild(el("div", { class: "field" }, [lab, t]));
    }
  }

  function renderExtras(step) {
    var frag = el("div", { class: "field" });
    var open = !!state.open[step.id] || step.extras.some(function (_, i) { return (val(step.id + ".x" + i) || "").trim(); });
    var btn = el("button", { class: "more", type: "button", "aria-expanded": open ? "true" : "false", "aria-controls": "x-" + step.id }, [
      el("span", { class: "plus", text: open ? "−" : "+" }), "Got more to say? Optional"
    ]);
    var box = el("div", { class: "extras", id: "x-" + step.id });
    box.hidden = !open;
    step.extras.forEach(function (label, i) {
      var id = step.id + ".x" + i;
      var lab = el("label", { for: "a-" + id.replace(".", "-"), id: "l-" + id.replace(".", "-"), text: label });
      var t = textarea("a-" + id.replace(".", "-"), "", "l-" + id.replace(".", "-"), function () { return val(id); }, function (x) { setVal(id, x); });
      box.appendChild(el("div", { class: "field" }, [lab, t]));
    });
    btn.addEventListener("click", function () {
      var nowOpen = box.hidden; box.hidden = !nowOpen; state.open[step.id] = nowOpen; save();
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      btn.querySelector(".plus").textContent = nowOpen ? "−" : "+";
      if (nowOpen) { box.querySelectorAll(".area").forEach(autosize); var f = box.querySelector(".area"); if (f) f.focus(); }
    });
    frag.appendChild(btn); frag.appendChild(box);
    return frag;
  }

  function renderNav(step) {
    var nav = el("div", { class: "nav" });
    var left = state.step > 0 ? el("button", { class: "back", type: "button", text: "← Back", onclick: back }) : el("span");
    var label = step.type === "intro" ? "Start" : step.type === "review" ? "Send to ASAP" : "Next";
    navBtn = el("button", { class: "btn", type: "button", id: "nextBtn", onclick: next }, [el("span", { text: label }), el("span", { "aria-hidden": "true", text: "→" })]);
    var right = el("div", { style: "display:flex;align-items:center;gap:16px" }, [
      step.type === "text" || step.type === "chips" ? el("span", { class: "kbd", text: "Ctrl + Enter" }) : null, navBtn
    ]);
    nav.appendChild(left); nav.appendChild(right);
    return nav;
  }

  function updateNav() {
    var step = STEPS[state.step];
    counts();
    if (!navBtn) return;
    var span = navBtn.firstChild;
    if (step.type === "intro") {
      var v = val("intro") || {};
      navBtn.disabled = !((v.name || "").trim() && (v.biz || "").trim());
    } else if (step.q && step.required) {
      navBtn.disabled = !filled(step);
      span.textContent = "Next";
    } else if (step.q) {
      span.textContent = filled(step) || hasExtras(step) ? "Next" : "Skip";
    }
  }
  function hasExtras(step) { return (step.extras || []).some(function (_, i) { return (val(step.id + ".x" + i) || "").trim(); }); }

  /* ---------- formatting answers ---------- */
  function answerText(step) {
    var v = val(step.id);
    if (!v) return "";
    if (step.type === "text") return String(v).trim();
    if (step.type === "fields") return step.fields.map(function (f) { return v[f[0]] && v[f[0]].trim() ? f[1] + ": " + v[f[0]].trim() : ""; }).filter(Boolean).join("\n");
    if (step.type === "rows") return v.filter(function (r) { return Object.keys(r).some(function (k) { return r[k] && String(r[k]).trim(); }); })
      .map(function (r) { return "- " + step.cols.map(function (c) { var x = (r[c[0]] || "").trim(); if (!x) return ""; return c[0] === "price" ? "$" + x.replace(/^\$/, "") : c[5] ? c[5] + " " + x : x; }).filter(Boolean).join(" | "); }).join("\n");
    if (step.type === "chips") return [v.pick && v.pick.length ? v.pick.join(", ") : "", v.text && v.text.trim() ? step.text[0] + ": " + v.text.trim() : ""].filter(Boolean).join("\n");
    return "";
  }
  function introLabel(key) { var f = BRIEF.intro.fields.filter(function (x) { return x[0] === key; })[0]; return f ? f[1] : key; }
  function briefText() {
    var i = val("intro") || {};
    var out = ["ASAP CLIENT BRIEF: " + FORM_NAME.toUpperCase(), introLabel("biz") + ": " + (i.biz || ""), "Contact: " + (i.name || "") + (i.contact ? " (" + i.contact + ")" : "")];
    META.forEach(function (m) { out.push(m[0] + ": " + m[1]); });
    out.push("Sent: " + new Date().toLocaleString("en-AU"), "");
    sections().forEach(function (sec) {
      out.push("## " + SECTIONS[sec].toUpperCase());
      questions().filter(function (q) { return q.sec === sec; }).forEach(function (q) {
        out.push(q.q); out.push(answerText(q) || "(skipped)");
        (q.extras || []).forEach(function (label, xi) { var x = (val(q.id + ".x" + xi) || "").trim(); if (x) { out.push(label); out.push(x); } });
        out.push("");
      });
    });
    return out.join("\n").trim();
  }

  /* ---------- review & send ---------- */
  function renderReview(card) {
    card.appendChild(el("p", { class: "eyebrow", text: "Last step" }));
    card.appendChild(el("h2", { class: "q", text: "Here's everything. Tap edit to change an answer." }));
    var list = el("div", { class: "review" });
    sections().forEach(function (sec) {
      var s = el("section", { class: "rsec" }, [el("h3", { text: SECTIONS[sec] })]);
      questions().filter(function (q) { return q.sec === sec; }).forEach(function (q) {
        var a = answerText(q);
        var extraCount = (q.extras || []).filter(function (_, xi) { return (val(q.id + ".x" + xi) || "").trim(); }).length;
        if (extraCount) a += (a ? "\n" : "") + "+ " + extraCount + " extra answer" + (extraCount > 1 ? "s" : "");
        s.appendChild(el("div", { class: "ritem" }, [
          el("div", { class: "rq", text: q.q }),
          el("button", { class: "linkbtn", type: "button", text: "Edit", "aria-label": "Edit: " + q.q, onclick: function () { go(STEPS.indexOf(q)); } }),
          el("div", { class: "ra" + (a ? "" : " empty"), text: a || (q.required ? "Needed: tap edit to answer" : "Skipped") })
        ]));
      });
      list.appendChild(s);
    });
    card.appendChild(list);
    card.appendChild(el("p", { class: "err", id: "sendErr", hidden: "hidden" }));
  }

  var lastSend = { ok: false };
  function payload(text) {
    var i = val("intro") || {};
    var fields = META.slice();
    STEPS.filter(function (s) { return s.q; }).forEach(function (q) {
      var on = active(q);
      fields.push([q.q, on ? answerText(q) : ""]);
      (q.extras || []).forEach(function (label, xi) { fields.push([label, on ? (val(q.id + ".x" + xi) || "").trim() : ""]); });
    });
    return { form: FORM_NAME, business: i.biz || "", name: i.name || "", contact: i.contact || "", website: i.website || "", fields: fields, text: text };
  }
  function send() {
    var missing = questions().filter(function (q) { return q.required && !filled(q); })[0];
    if (missing) { go(STEPS.indexOf(missing)); return; }
    var btn = $("nextBtn"); if (btn) { btn.disabled = true; btn.firstChild.textContent = "Sending"; }
    var text = briefText();
    var finish = function (ok) {
      lastSend = { ok: ok, text: text };
      if (ok) state.submitted = new Date().toISOString();
      go(STEPS.length - 1);
    };
    if (!SCRIPT_URL) { finish(false); return; }
    // Plain-text body keeps this a simple request, so Google accepts it without a pre-check.
    fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload(text)) })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (res) { finish(!!(res && res.ok)); })
      .catch(function () { finish(false); });
  }

  function renderDone(card) {
    var text = lastSend.text || briefText();
    var ok = lastSend.ok || (!!state.submitted && !lastSend.text);
    card.appendChild(el("p", { class: "eyebrow", text: ok ? "Brief received" : "Almost there" }));
    card.appendChild(el("h2", { class: "q", text: ok ? "Thanks. Your brief is with the ASAP team." : "One last step: send us your answers." }));
    if (ok) {
      card.appendChild(el("div", { class: "copy" }, [
        el("p", { text: BRIEF.doneText || "We'll read through everything and be in touch to book your call. If you think of anything else, just come back to this page and update your answers." })
      ]));
    } else {
      card.appendChild(el("div", { class: "copy" }, [
        el("p", {}, withEmail("Copy your answers with the button below and paste them into an email to {email}. That's it."))
      ]));
    }
    var acts = el("div", { class: "nav" }, [
      el("button", { class: "back", type: "button", text: "← Edit answers", onclick: function () { go(STEPS.length - 2); } }),
      el("button", { class: ok ? "btn ghost" : "btn", type: "button", onclick: function () { copyText(text); } }, [el("span", { text: "Copy my answers" })])
    ]);
    card.appendChild(acts);
    card.appendChild(el("div", { id: "copyBox" }));
  }

  /* ---------- navigation ---------- */
  function go(i) { state.step = Math.max(0, Math.min(STEPS.length - 1, i)); render(); }
  // Steps that don't apply to this client's picks are skipped in both directions.
  function move(dir) {
    var i = state.step + dir;
    while (i > 0 && i < STEPS.length - 1 && !active(STEPS[i])) i += dir;
    go(i);
  }
  function next() {
    var step = STEPS[state.step];
    if (step.type === "intro") { var v = val("intro") || {}; if (!((v.name || "").trim() && (v.biz || "").trim())) return; }
    if (step.required && !filled(step)) return;
    if (step.type === "review") { send(); return; }
    move(1);
  }
  function back() { move(-1); }

  if (!active(STEPS[state.step])) state.step = 0;
  render(false);
})();
