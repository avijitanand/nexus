/* app.js — Production controller */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    });
    children.flat().forEach(c => n.append(c && c.nodeType ? c : document.createTextNode(c ?? "")));
    return n;
  };

  const state = { user: null, pollTimer: null, notifTimer: null };

  // ---------- Boot ----------
  window.addEventListener("load", async () => {
    setTimeout(() => $("#splash")?.classList.add("hide"), 800);
    const token = localStorage.getItem("nexus_token");
    if (token) {
      try {
        state.user = await API.me();
        if (!state.user.role) { showAuth(); showRoleModal(); }
        else showMain();
      } catch { localStorage.removeItem("nexus_token"); showAuth(); }
    } else showAuth();
  });

  function showAuth() { $("#view-auth").classList.remove("hidden"); $("#view-main").classList.add("hidden"); }
  function showMain() {
    $("#view-auth").classList.add("hidden");
    $("#view-main").classList.remove("hidden");
    renderUser(); renderNav(); navigate("dashboard");
    state.notifTimer = setInterval(refreshNotifications, 10000);
    refreshNotifications();
  }
  function renderUser() {
    const i = (state.user.name || "U")[0].toUpperCase();
    $("#user-avatar").textContent = i; $("#side-avatar").textContent = i;
    $("#side-name").textContent = state.user.name;
    $("#side-role").textContent = state.user.role;
  }

  // ---------- Auth ----------
  $$(".tab").forEach(t => t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("#login-form").classList.toggle("hidden", t.dataset.tab !== "login");
    $("#signup-form").classList.toggle("hidden", t.dataset.tab !== "signup");
  }));

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await API.login({ email: fd.get("email"), password: fd.get("password") });
      localStorage.setItem("nexus_token", r.token);
      state.user = r.user;
      toast("Welcome back, " + state.user.name, "success");
      showMain();
    } catch (err) { toast(err.message, "error"); }
  });

  $("#signup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await API.signup({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), role: fd.get("role") });
      localStorage.setItem("nexus_token", r.token);
      state.user = r.user;
      toast("Account created! 🎉", "success");
      showMain();
    } catch (err) { toast(err.message, "error"); }
  });

  $("#google-btn").addEventListener("click", async () => {
    try {
      const r = await API.googleLogin();
      localStorage.setItem("nexus_token", r.token);
      state.user = r.user;
      if (r.isNew || !state.user.role) showRoleModal();
      else { toast("Welcome back, " + state.user.name + "! 🎉", "success"); showMain(); }
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") return;
      toast(err.message, "error");
    }
  });

  function showRoleModal() {
    const first = (state.user.name || "there").split(" ")[0];
    const hints = { client: "Post projects, hire talent, and let AI negotiate for you.", freelancer: "Find work, send proposals, and get hired faster." };
    const body = el("div", {},
      el("div", { style: "text-align:center;margin-bottom:20px;" },
        el("div", { style: "font-size:44px;" }, "👋"),
        el("div", { style: "font-size:18px;font-weight:700;margin-top:10px;" }, "Welcome to Nexus, " + first + "!"),
        el("div", { style: "color:var(--fg-dim);font-size:13px;margin-top:4px;" }, "How do you want to use the platform?")
      ),
      el("div", { class: "role-select" },
        el("label", { class: "role-option selected" }, el("input", { type: "radio", name: "grole", value: "client", checked: "" }), el("span", {}, "🏢 Client")),
        el("label", { class: "role-option" }, el("input", { type: "radio", name: "grole", value: "freelancer" }), el("span", {}, "💼 Freelancer"))
      ),
      el("div", { id: "role-hint", style: "font-size:12px;color:var(--fg-mute);margin-top:10px;text-align:center;" }, hints.client),
      el("button", { id: "role-done", class: "btn btn-primary btn-block", style: "margin-top:20px;" }, "Continue →")
    );
    body.querySelectorAll("input[name=grole]").forEach(r => r.addEventListener("change", () => {
      body.querySelectorAll(".role-option").forEach(o => o.classList.remove("selected"));
      r.closest(".role-option").classList.add("selected");
      body.querySelector("#role-hint").textContent = hints[r.value];
    }));
    openModal("Pick your role", body);
    body.querySelector("#role-done").addEventListener("click", async () => {
      const role = body.querySelector("input[name=grole]:checked").value;
      try {
        await API.setRole(role);
        state.user.role = role;
        closeModal();
        toast("You're all set! 🎉", "success");
        showMain();
      } catch (err) { toast(err.message, "error"); }
    });
  }

  $("#logout-btn").addEventListener("click", async () => {
    try { await API.logout(); } catch {}
    localStorage.removeItem("nexus_token");
    location.reload();
  });

  // ---------- Nav ----------
  const NAV_CLIENT = [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "projects", label: "My Projects", icon: "▤" },
    { id: "post", label: "Post Project", icon: "+" },
    { id: "proposals", label: "Proposals", icon: "✉" },
    { id: "offers", label: "AI Offers", icon: "✦" },
    { id: "chat", label: "Messages", icon: "◈" },
    { id: "profile", label: "Profile", icon: "◐" },
  ];
  const NAV_FREELANCER = [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "browse", label: "Browse Projects", icon: "▤" },
    { id: "myproposals", label: "My Proposals", icon: "✉" },
    { id: "offers", label: "AI Offers", icon: "✦" },
    { id: "active", label: "Active Work", icon: "▶" },
    { id: "chat", label: "Messages", icon: "◈" },
    { id: "profile", label: "Profile", icon: "◐" },
  ];

  function renderNav() {
    const nav = $("#nav"); nav.innerHTML = "";
    (state.user.role === "client" ? NAV_CLIENT : NAV_FREELANCER).forEach(it => {
      nav.append(el("div", { class: "nav-item", "data-view": it.id, onClick: () => navigate(it.id) },
        el("span", { class: "ico" }, it.icon), el("span", {}, it.label)));
    });
  }

  function navigate(view) {
    state.currentView = view;
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
    const titles = { dashboard: "Dashboard", projects: "My Projects", post: "Post Project", proposals: "Proposals", offers: "AI Offers", chat: "Messages", profile: "Profile", browse: "Browse Projects", myproposals: "My Proposals", active: "Active Work" };
    $("#view-title").textContent = titles[view] || "Dashboard";
    const page = el("div", { class: "view-page" });
    $("#content").innerHTML = ""; $("#content").append(page);
    renderers[view](page).catch(e => { console.error(e); page.append(el("div", { class: "empty" }, "Failed to load view")); });
    if (window.innerWidth <= 900) $("#sidebar").classList.remove("open");
  }
  $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  // ---------- Renderers ----------
  const renderers = {};

  renderers.dashboard = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {},
        el("div", { class: "page-title" }, "Hello, " + state.user.name.split(" ")[0] + " 👋"),
        el("div", { class: "page-sub" }, state.user.role === "client" ? "Here's what's happening with your projects" : "Here's your freelance activity")
      )));
    const stats = el("div", { class: "grid grid-4" });
    root.append(stats);

    if (state.user.role === "client") {
      const [projects, offers] = await Promise.all([API.listProjects({ mine: true }), API.listOffers()]);
      const savings = offers.reduce((s, o) => s + Number(o.savings || 0), 0);
      const spent = offers.filter(o => o.status === "accepted").reduce((s, o) => s + Number(o.finalAmount || 0), 0);
      stats.append(
        statCard("Active Projects", projects.filter(p => p.status !== "closed").length, "ongoing"),
        statCard("Total Proposals", projects.reduce((s, p) => s + Number(p.proposalCount || 0), 0), "received"),
        statCard("AI Savings", "$" + savings, "negotiated"),
        statCard("Total Spent", "$" + spent, "invested")
      );
      root.append(el("h3", { style: "margin:24px 0 12px;font-size:18px;" }, "Recent Projects"));
      const list = el("div", { class: "grid grid-2" }); root.append(list);
      projects.slice(0, 4).forEach(p => list.append(projectCard(p)));
      if (!projects.length) root.append(emptyState("No projects yet", "Post your first project", () => navigate("post")));
    } else {
      const [projects, proposals, offers] = await Promise.all([API.listProjects({}), API.myProposals(), API.listOffers()]);
      const earnings = offers.filter(o => o.status === "accepted").reduce((s, o) => s + Number(o.finalAmount || 0), 0);
      stats.append(
        statCard("Available Jobs", projects.filter(p => p.status === "open").length, "matching"),
        statCard("Active Contracts", proposals.filter(p => p.status === "accepted").length, "in progress"),
        statCard("My Proposals", proposals.length, "sent"),
        statCard("Earnings", "$" + earnings, "total")
      );
      root.append(el("h3", { style: "margin:24px 0 12px;font-size:18px;" }, "Recommended Projects"));
      const list = el("div", { class: "grid grid-2" }); root.append(list);
      const profile = state.user.profile || {};
      projects.filter(p => p.status === "open")
        .map(p => ({ ...p, match: AI.computeMatch(p, profile) }))
        .sort((a, b) => b.match.overall - a.match.overall)
        .slice(0, 4)
        .forEach(p => list.append(projectCard(p)));
    }
  };

  function statCard(label, value, delta) {
    return el("div", { class: "stat" },
      el("div", { class: "stat-label" }, label),
      el("div", { class: "stat-value" }, String(value)),
      el("div", { class: "stat-delta" }, delta));
  }

  function emptyState(title, sub, action) {
    const e = el("div", { class: "empty" },
      el("div", { class: "empty-icon" }, "∅"),
      el("div", { style: "font-size:16px;font-weight:600;margin-bottom:4px;" }, title),
      el("div", { style: "font-size:13px;" }, sub));
    if (action) e.append(el("button", { class: "btn btn-primary", style: "margin-top:16px;", onClick: action }, "Get Started"));
    return e;
  }

  function projectCard(p) {
    return el("div", { class: "card project-card", onClick: () => openProject(p.id) },
      el("div", { style: "display:flex;justify-content:space-between;align-items:start;" },
        el("div", { class: "card-title" }, p.title),
        el("span", { class: "status " + (p.status || "open") }, p.status || "open")),
      el("div", { class: "meta" },
        el("span", { class: "chip" }, "$" + (p.budget || 0)),
        el("span", { class: "chip" }, "⏱ " + (p.deadline || "Flexible")),
        p.match ? el("span", { class: "chip accent" }, "✦ " + p.match.overall + "% match") : null),
      el("div", { class: "desc" }, p.description || ""),
      el("div", { class: "chips" }, ...(p.skills || []).slice(0, 4).map(s => el("span", { class: "chip" }, s))),
      el("div", { class: "footer" },
        el("span", { style: "font-size:12px;color:var(--fg-dim);" }, (p.proposalCount || 0) + " proposals"),
        el("span", { style: "font-size:12px;color:var(--fg-dim);" }, formatDate(p.createdAt))));
  }

  function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; }
  function formatTime(iso) { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""; }

  renderers.post = (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {},
        el("div", { class: "page-title" }, "Post a New Project"),
        el("div", { class: "page-sub" }, "Our AI will find the best freelancers and negotiate for you"))));
    const form = el("form", { class: "card", style: "max-width:720px;" });
    form.append(
      field("Project Title", "title", "text", "e.g. Build a React dashboard"),
      field("Description", "description", "textarea", "Describe your requirements in detail..."),
      field("Required Skills (comma separated)", "skills", "text", "e.g. React, Node.js, UI/UX"),
      el("div", { class: "grid grid-2" }, field("Budget (USD)", "budget", "number", "500"), field("Deadline", "deadline", "text", "e.g. 2 weeks")),
      el("div", { class: "grid grid-2" },
        field("Project Type", "type", "select", "", [["fixed", "Fixed Price"], ["hourly", "Hourly"]]),
        field("Urgency", "urgency", "select", "", [["normal", "Normal"], ["urgent", "Urgent"]])),
      el("div", { style: "display:flex;gap:10px;margin-top:20px;" },
        el("button", { type: "submit", class: "btn btn-primary" }, "Post Project"),
        el("button", { type: "button", class: "btn btn-ghost", onClick: () => navigate("dashboard") }, "Cancel")));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.skills = data.skills.split(",").map(s => s.trim()).filter(Boolean);
      data.budget = Number(data.budget);
      try { await API.createProject(data); toast("Project posted! Freelancers can now find it.", "success"); navigate("projects"); }
      catch (err) { toast(err.message, "error"); }
    });
    root.append(form);
  };

  function field(label, name, type, placeholder, options) {
    const wrap = el("div", { class: "field" }, el("label", {}, label));
    if (type === "textarea") wrap.append(el("textarea", { name, placeholder }));
    else if (type === "select") {
      const sel = el("select", { name });
      (options || []).forEach(([v, l]) => sel.append(el("option", { value: v }, l)));
      wrap.append(sel);
    } else wrap.append(el("input", { type, name, placeholder }));
    return wrap;
  }

  renderers.projects = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "My Projects"), el("div", { class: "page-sub" }, "Manage all your posted projects")),
      el("button", { class: "btn btn-primary", onClick: () => navigate("post") }, "+ New Project")));
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const projects = await API.listProjects({ mine: true });
    if (!projects.length) root.append(emptyState("No projects yet", "Post your first project", () => navigate("post")));
    else projects.forEach(p => list.append(projectCard(p)));
  };

  renderers.browse = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "Browse Projects"), el("div", { class: "page-sub" }, "Projects matched to your skills"))));
    const search = el("input", { type: "text", placeholder: "Search projects...", style: "width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--fg);margin-bottom:16px;" });
    root.append(search);
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const profile = state.user.profile || {};
    const load = async (q = "") => {
      const projects = await API.listProjects({ q });
      list.innerHTML = "";
      const ranked = projects.filter(p => p.status === "open")
        .map(p => ({ ...p, match: AI.computeMatch(p, profile) }))
        .sort((a, b) => b.match.overall - a.match.overall);
      if (!ranked.length) list.append(emptyState("No matching projects", "Try different search terms"));
      else ranked.forEach(p => list.append(projectCard(p)));
    };
    let t; search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => load(search.value), 300); });
    await load();
  };

  async function openProject(id) {
    const p = await API.getProject(id);
    if (!p) return toast("Project not found", "error");
    const match = AI.computeMatch(p, state.user.profile || {});
    const body = el("div", {},
      el("div", { style: "display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;" },
        el("div", {},
          el("div", { style: "font-size:22px;font-weight:700;" }, p.title),
          el("div", { style: "color:var(--fg-dim);font-size:13px;margin-top:4px;" }, "Posted " + formatDate(p.createdAt) + " by " + (p.clientName || "Client"))),
        el("span", { class: "status " + (p.status || "open") }, p.status || "open")),
      el("div", { class: "chips", style: "margin-bottom:16px;" },
        el("span", { class: "chip" }, "$" + p.budget),
        el("span", { class: "chip" }, "⏱ " + p.deadline),
        el("span", { class: "chip" }, p.type || "fixed"),
        ...(p.skills || []).map(s => el("span", { class: "chip" }, s))),
      el("div", { style: "line-height:1.6;color:var(--fg-dim);margin-bottom:20px;white-space:pre-wrap;" }, p.description),
      state.user.role === "freelancer" ? el("div", { class: "card", style: "margin-bottom:16px;" },
        el("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:12px;" },
          el("span", { class: "ai-pulse" }), el("div", { style: "font-weight:600;" }, "AI Match Analysis")),
        el("div", { class: "grid grid-2", style: "gap:8px;" },
          matchRow("Overall Match", match.overall + "%"), matchRow("Skills", match.skills + "%"),
          matchRow("Experience", match.exp + "%"), matchRow("Budget Fit", match.budget + "%"))) : null,
      el("div", { style: "display:flex;gap:10px;" },
        state.user.role === "freelancer" && p.status === "open" ? el("button", { class: "btn btn-primary", onClick: () => sendProposalModal(p) }, "Send Proposal") : null,
        state.user.role === "client" ? el("button", { class: "btn btn-primary", onClick: () => aiMatchModal(p) }, "✦ AI Find Freelancers") : null,
        el("button", { class: "btn btn-ghost", onClick: closeModal }, "Close")));
    openModal(p.title, body);
  }

  function matchRow(label, value) {
    return el("div", { style: "display:flex;justify-content:space-between;padding:6px 0;font-size:13px;" },
      el("span", { style: "color:var(--fg-dim);" }, label), el("span", { style: "font-weight:600;" }, value));
  }

  function sendProposalModal(project) {
    const body = el("form", {},
      field("Your Price (USD)", "amount", "number", String(project.budget)),
      field("Delivery Time", "delivery", "text", "e.g. 7 days"),
      field("Cover Letter", "message", "textarea", "Explain why you're the best fit..."),
      el("div", { style: "display:flex;gap:10px;margin-top:16px;" },
        el("button", { type: "submit", class: "btn btn-primary" }, "Send Proposal"),
        el("button", { type: "button", class: "btn btn-ghost", onClick: closeModal }, "Cancel")));
    body.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(body);
      try {
        await API.sendProposal({ projectId: project.id, amount: Number(fd.get("amount")), delivery: fd.get("delivery"), message: fd.get("message") });
        closeModal(); toast("Proposal sent! ✨", "success");
      } catch (err) { toast(err.message, "error"); }
    });
    openModal("Submit Proposal", body);
  }

  async function aiMatchModal(project) {
    openModal("AI Matching", el("div", { style: "text-align:center;padding:30px;" },
      el("span", { class: "ai-pulse", style: "width:14px;height:14px;" }),
      el("div", { style: "margin-top:16px;" }, "AI is analyzing freelancers...")));
    try {
      const matches = await API.aiMatch(project.id);
      const content = el("div", {});
      if (!matches.length) content.append(el("div", { class: "empty" }, "No freelancers registered yet. Ask a friend to sign up as a freelancer!"));
      matches.slice(0, 8).forEach(m => {
        content.append(el("div", { class: "card", style: "margin-bottom:10px;display:flex;gap:14px;align-items:center;" },
          el("div", { class: "match-score", style: "--s:" + m.match.overall }, el("span", {}, m.match.overall)),
          el("div", { style: "flex:1;" },
            el("div", { style: "font-weight:600;" }, m.name),
            el("div", { style: "font-size:12px;color:var(--fg-dim);margin-top:2px;" }, m.title || "Freelancer"),
            m.reason ? el("div", { style: "font-size:12px;color:var(--accent);margin-top:4px;" }, "💡 " + m.reason) : null,
            el("div", { class: "chips", style: "margin-top:6px;" },
              el("span", { class: "chip" }, "$" + (m.hourlyRate || m.rate || 0) + "/hr"),
              el("span", { class: "chip" }, "★ " + Number(m.rating || 0).toFixed(1)))),
          el("button", { class: "btn btn-primary btn-sm", onClick: () => { closeModal(); startNegotiation(project, m); } }, "Negotiate")));
      });
      openModal("Top Matches for \"" + project.title + "\"", content);
    } catch (err) { closeModal(); toast(err.message, "error"); }
  }

  async function startNegotiation(project, freelancer) {
    openModal("AI Negotiation", el("div", { style: "text-align:center;padding:30px;" },
      el("span", { class: "ai-pulse", style: "width:14px;height:14px;" }),
      el("div", { style: "margin-top:16px;" }, "AI is negotiating with " + freelancer.name + "...")));
    try {
      const result = await API.aiNegotiate({ projectId: project.id, freelancerId: freelancer.id });
      const content = el("div", {},
        el("div", { class: "card offer-card", style: "margin-bottom:16px;" },
          el("div", { style: "font-size:12px;color:var(--fg-dim);text-transform:uppercase;" }, "AI-Negotiated Offer"),
          el("div", { style: "margin:12px 0;" },
            el("span", { class: "offer-price" }, "$" + result.counterOffer),
            el("span", { class: "offer-original" }, "$" + result.originalRate)),
          el("div", { class: "offer-savings" }, "You save $" + result.savings + " (" + result.savingsPct + "% off)"),
          el("div", { style: "margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;font-size:13px;line-height:1.5;color:var(--fg-dim);" },
            el("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:6px;" },
              el("span", { class: "ai-pulse" }), el("strong", { style: "color:var(--fg);" }, "AI Message to Freelancer")),
            result.message),
          el("div", { style: "margin-top:12px;font-size:12px;color:var(--fg-dim);" }, "Confidence: " + Math.round(result.confidence) + "%")),
        el("div", { style: "display:flex;gap:10px;" },
          el("button", { class: "btn btn-primary", onClick: async () => { try { await API.respondOffer({ offerId: result.offerId, action: "send" }); closeModal(); toast("Offer sent to " + freelancer.name + "!", "success"); } catch (e) { toast(e.message, "error"); } } }, "Send Offer"),
          el("button", { class: "btn btn-ghost", onClick: closeModal }, "Cancel")));
      openModal("Negotiation Result", content);
    } catch (err) { closeModal(); toast(err.message, "error"); }
  }

  renderers.proposals = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "Incoming Proposals"), el("div", { class: "page-sub" }, "Review proposals for your projects"))));
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const projects = await API.listProjects({ mine: true });
    for (const p of projects) {
      const props = await API.listProposals(p.id);
      props.forEach(pr => {
        list.append(el("div", { class: "card" },
          el("div", { style: "display:flex;justify-content:space-between;align-items:start;" },
            el("div", {}, el("div", { style: "font-weight:600;" }, pr.freelancerName), el("div", { style: "font-size:12px;color:var(--fg-dim);" }, "for: " + p.title)),
            el("div", { style: "font-size:22px;font-weight:700;" }, "$" + pr.amount)),
          el("div", { style: "font-size:13px;color:var(--fg-dim);margin:10px 0;line-height:1.5;" }, pr.message),
          el("div", { style: "font-size:12px;color:var(--fg-mute);margin-bottom:10px;" }, "Delivery: " + pr.delivery),
          el("div", { style: "display:flex;gap:8px;" },
            pr.status === "pending" ? el("button", { class: "btn btn-primary btn-sm", onClick: async () => { await API.acceptProposal({ proposalId: pr.id }); toast("Accepted! Chat opened.", "success"); navigate("proposals"); } }, "Accept") : null,
            pr.status === "pending" ? el("button", { class: "btn btn-ghost btn-sm", onClick: async () => { await API.rejectProposal({ proposalId: pr.id }); toast("Rejected", "info"); navigate("proposals"); } }, "Reject") : null,
            el("span", { class: "chip", style: "margin-left:auto;" }, pr.status))));
      });
    }
    if (!list.children.length) root.append(emptyState("No proposals yet", "Proposals will appear here"));
  };

  renderers.myproposals = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "My Proposals"), el("div", { class: "page-sub" }, "Track your submitted proposals"))));
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const props = await API.myProposals();
    if (!props.length) root.append(emptyState("No proposals yet", "Browse projects to send your first"));
    props.forEach(pr => {
      list.append(el("div", { class: "card" },
        el("div", { style: "font-weight:600;" }, pr.projectTitle),
        el("div", { style: "display:flex;justify-content:space-between;margin-top:10px;" },
          el("span", { class: "chip" }, "$" + pr.amount), el("span", { class: "chip" }, pr.status)),
        el("div", { style: "font-size:12px;color:var(--fg-dim);margin-top:8px;" }, formatDate(pr.createdAt))));
    });
  };

  renderers.offers = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "AI-Negotiated Offers"), el("div", { class: "page-sub" }, "Smart deals negotiated on your behalf"))));
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const offers = await API.listOffers();
    if (!offers.length) root.append(emptyState("No offers yet", "Offers appear here after AI negotiation"));
    offers.forEach(o => {
      list.append(el("div", { class: "card offer-card" },
        el("div", { style: "display:flex;justify-content:space-between;align-items:start;" },
          el("div", {}, el("div", { style: "font-weight:600;" }, o.projectTitle), el("div", { style: "font-size:12px;color:var(--fg-dim);margin-top:2px;" }, "with " + (o.otherParty || ""))),
          el("span", { class: "chip accent" }, "✦ AI")),
        el("div", { style: "margin:14px 0;" },
          el("span", { class: "offer-price" }, "$" + o.finalAmount),
          o.originalAmount ? el("span", { class: "offer-original" }, "$" + o.originalAmount) : null),
        o.savings > 0 ? el("div", { class: "offer-savings" }, "Save $" + o.savings + " (" + o.savingsPct + "%)") : null,
        el("div", { style: "display:flex;gap:8px;margin-top:14px;" },
          o.status === "pending" && state.user.role === "freelancer" ? el("button", { class: "btn btn-primary btn-sm", onClick: async () => { await API.respondOffer({ offerId: o.id, action: "accept" }); toast("Accepted! Chat opened.", "success"); navigate("offers"); } }, "Accept") : null,
          o.status === "pending" && state.user.role === "freelancer" ? el("button", { class: "btn btn-ghost btn-sm", onClick: async () => { await API.respondOffer({ offerId: o.id, action: "reject" }); toast("Declined", "info"); navigate("offers"); } }, "Decline") : null,
          el("span", { class: "chip", style: "margin-left:auto;" }, o.status))));
    });
  };

  renderers.active = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "Active Work"), el("div", { class: "page-sub" }, "Your ongoing contracts"))));
    const list = el("div", { class: "grid grid-2" }); root.append(list);
    const props = await API.myProposals();
    const active = props.filter(p => p.status === "accepted");
    if (!active.length) root.append(emptyState("No active contracts", "Accepted proposals appear here"));
    active.forEach(p => {
      list.append(el("div", { class: "card" },
        el("div", { style: "font-weight:600;" }, p.projectTitle),
        el("div", { style: "display:flex;justify-content:space-between;padding:8px 0;" }, el("span", {}, "Amount"), el("span", { style: "font-weight:600;" }, "$" + p.amount)),
        el("div", { style: "display:flex;gap:8px;margin-top:12px;" },
          el("button", { class: "btn btn-primary btn-sm", onClick: () => navigate("chat") }, "💬 Message Client"),
          el("button", { class: "btn btn-ghost btn-sm", onClick: () => rateModal(p) }, "★ Rate"))));
    });
  };

  function rateModal(contract) {
    const body = el("form", {},
      field("Rating (1-5)", "rating", "number", "5"),
      field("Review", "review", "textarea", "Share your experience..."),
      el("div", { style: "display:flex;gap:10px;margin-top:16px;" },
        el("button", { type: "submit", class: "btn btn-primary" }, "Submit"),
        el("button", { type: "button", class: "btn btn-ghost", onClick: closeModal }, "Cancel")));
    body.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(body);
      try { await API.submitRating({ targetId: contract.clientId || contract.freelancerId, rating: Number(fd.get("rating")), review: fd.get("review") }); closeModal(); toast("Thanks for your feedback!", "success"); }
      catch (err) { toast(err.message, "error"); }
    });
    openModal("Rate your experience", body);
  }

  renderers.chat = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "Messages"), el("div", { class: "page-sub" }, "Chat with clients and freelancers"))));
    const layout = el("div", { class: "chat-layout" });
    const list = el("div", { class: "chat-list" });
    const main = el("div", { class: "chat-main" },
      el("div", { class: "empty", style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;" },
        el("div", { class: "empty-icon" }, "◈"), el("div", {}, "Select a conversation")));
    layout.append(list, main); root.append(layout);
    const convs = await API.listConversations();
    if (!convs.length) list.append(el("div", { class: "empty", style: "padding:20px;" }, "No conversations yet. They appear when a proposal or offer is accepted."));
    convs.forEach(c => {
      const item = el("div", { class: "chat-item", onClick: () => openChat(c, item, main) },
        el("div", { class: "avatar" }, (c.otherName || "?")[0].toUpperCase()),
        el("div", { style: "flex:1;overflow:hidden;" },
          el("div", { style: "font-weight:600;font-size:14px;" }, c.otherName || "User"),
          el("div", { style: "font-size:12px;color:var(--fg-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, c.lastMessage || "Start a conversation")));
      list.append(item);
    });
  };

  async function openChat(conv, itemEl, mainEl) {
    $$(".chat-item").forEach(x => x.classList.remove("active"));
    itemEl.classList.add("active");
    mainEl.innerHTML = "";
    mainEl.append(
      el("div", { class: "chat-header" },
        el("div", { style: "display:flex;align-items:center;gap:10px;" },
          el("div", { class: "avatar" }, (conv.otherName || "?")[0].toUpperCase()),
          el("div", {}, el("div", { style: "font-weight:600;" }, conv.otherName), el("div", { style: "font-size:12px;color:var(--fg-dim);" }, conv.projectTitle || "")))),
      el("div", { class: "chat-messages", id: "chat-messages" }),
      el("div", { class: "chat-input" },
        el("input", { type: "text", placeholder: "Type a message...", id: "chat-input" }),
        el("button", { class: "btn btn-primary", id: "chat-send" }, "Send")));
    const messages = $("#chat-messages");
    const load = async () => {
      const msgs = await API.getMessages({ conversationId: conv.id });
      messages.innerHTML = "";
      msgs.forEach(m => messages.append(el("div", { class: "msg " + (m.senderId === state.user.id ? "me" : "them") },
        el("div", {}, m.text), el("div", { class: "msg-time" }, formatTime(m.createdAt)))));
      messages.scrollTop = messages.scrollHeight;
    };
    await load();
    const send = async () => {
      const input = $("#chat-input"); const text = input.value.trim();
      if (!text) return; input.value = "";
      try { await API.sendMessage({ conversationId: conv.id, text }); await load(); }
      catch (err) { toast(err.message, "error"); }
    };
    $("#chat-send").onclick = send;
    $("#chat-input").onkeydown = e => { if (e.key === "Enter") send(); };
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(load, 5000);
  }

  renderers.profile = async (root) => {
    root.append(el("div", { class: "page-header" },
      el("div", {}, el("div", { class: "page-title" }, "My Profile"), el("div", { class: "page-sub" }, state.user.role === "freelancer" ? "Showcase your skills to attract clients" : "Your account settings"))));
    const profile = state.user.profile || {};
    const form = el("form", { class: "card", style: "max-width:720px;" });
    form.append(field("Display Title", "title", "text", profile.title || ""));
    if (state.user.role === "freelancer") {
      form.append(
        field("Bio", "bio", "textarea", profile.bio || ""),
        field("Skills (comma separated)", "skills", "text", (profile.skills || []).join(", ")),
        el("div", { class: "grid grid-3" },
          field("Hourly Rate (USD)", "hourlyRate", "number", String(profile.hourlyRate || 50)),
          field("Experience (years)", "experience", "number", String(profile.experience || 0)),
          field("Availability", "availability", "text", profile.availability || "Full-time")));
    } else {
      form.append(field("Company", "company", "text", profile.company || ""), field("Bio", "bio", "textarea", profile.bio || ""));
    }
    form.append(el("div", { style: "display:flex;gap:10px;margin-top:20px;" }, el("button", { type: "submit", class: "btn btn-primary" }, "Save Profile")));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (data.skills) data.skills = data.skills.split(",").map(s => s.trim()).filter(Boolean);
      if (data.hourlyRate) data.hourlyRate = Number(data.hourlyRate);
      if (data.experience) data.experience = Number(data.experience);
      try { await API.updateProfile(data); state.user.profile = { ...state.user.profile, ...data }; toast("Profile updated!", "success"); }
      catch (err) { toast(err.message, "error"); }
    });
    root.append(form);

    if (state.user.role === "freelancer") {
      root.append(el("h3", { style: "margin:24px 0 12px;font-size:18px;" }, "Reviews"));
      const ratings = await API.getRatings(state.user.id);
      if (!ratings.length) root.append(el("div", { class: "card" }, "No reviews yet"));
      const rlist = el("div", { class: "grid grid-2" }); root.append(rlist);
      ratings.forEach(r => rlist.append(el("div", { class: "card" },
        el("div", { style: "display:flex;justify-content:space-between;" },
          el("div", { style: "font-weight:600;" }, r.reviewerName),
          el("div", {}, "★".repeat(Number(r.rating)) + "☆".repeat(5 - Number(r.rating)))),
        el("div", { style: "font-size:13px;color:var(--fg-dim);margin-top:8px;line-height:1.5;" }, r.review),
        el("div", { style: "font-size:11px;color:var(--fg-mute);margin-top:8px;" }, formatDate(r.createdAt)))));
    }
  };

  // ---------- Modal / Toast / Notifications ----------
  function openModal(title, body) {
    const root = $("#modal-root"); root.innerHTML = "";
    const backdrop = el("div", { class: "modal-backdrop", onClick: e => { if (e.target === backdrop) closeModal(); } },
      el("div", { class: "modal" },
        el("div", { class: "modal-header" }, el("div", { class: "modal-title" }, title), el("button", { class: "modal-close", onClick: closeModal }, "✕")),
        body));
    root.append(backdrop);
  }
  function closeModal() { $("#modal-root").innerHTML = ""; }

  async function refreshNotifications() {
    try {
      const notifs = await API.listNotifications();
      const unread = notifs.filter(n => !n.read).length;
      const badge = $("#notif-badge");
      if (unread > 0) { badge.textContent = unread; badge.classList.remove("hidden"); }
      else badge.classList.add("hidden");
    } catch {}
  }
  $("#notif-btn").addEventListener("click", async () => {
    const notifs = await API.listNotifications();
    const body = el("div", {});
    if (!notifs.length) body.append(el("div", { class: "empty" }, "No notifications"));
    notifs.slice(0, 20).forEach(n => {
      body.append(el("div", { class: "card", style: "margin-bottom:8px;padding:14px;" + (n.read ? "opacity:0.6;" : "") },
        el("div", { style: "font-weight:600;" }, n.title),
        el("div", { style: "font-size:13px;color:var(--fg-dim);margin-top:4px;" }, n.message),
        el("div", { style: "font-size:11px;color:var(--fg-mute);margin-top:6px;" }, formatDate(n.createdAt))));
      if (!n.read) API.markNotifRead(n.id).catch(() => {});
    });
    openModal("Notifications", body);
    refreshNotifications();
  });

  function toast(msg, type = "info") {
    const t = el("div", { class: "toast " + type }, msg);
    $("#toast-container").append(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(30px)"; setTimeout(() => t.remove(), 300); }, 3500);
  }
})();