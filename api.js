/* api.js — Production: Firebase Auth + Firestore data + Gemini AI backend */
const API = (() => {
  const fb = window.firebaseFuncs;
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;

  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwcurUW4BQQQu9rxFBebfj2rXf2arh4WoLPRO1X0mhLyenuGp1C2yXTbZRHRXtD0DfwwA/exec';

  const uid = () => auth.currentUser?.uid || '';

  // ---------- helpers ----------
  async function getDocs(query) {
    const snap = await query.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  let _me = null;
  async function getMe(force) {
    if (_me && !force) return _me;
    const user = auth.currentUser;
    if (!user) throw new Error('Not logged in');
    const snap = await fb.getDoc(fb.doc(db, 'users', user.uid));
    const d = snap.exists ? snap.data() : {};
    _me = { id: user.uid, name: d.name || user.displayName || 'User', email: user.email, role: d.role || null, profile: d.profile || {} };
    return _me;
  }

  async function notify(userId, title, message) {
    if (!userId || userId === uid()) return;
    await db.collection('notifications').add({ userId, title, message, read: false, createdAt: new Date().toISOString() });
  }

  async function ensureConversation(project, clientUid, clientName, freelancerUid, freelancerName) {
    const convId = [clientUid, freelancerUid].sort().join('-') + '-' + project.id;
    await fb.setDoc(fb.doc(db, 'conversations', convId), {
      userA: clientUid, userAName: clientName,
      userB: freelancerUid, userBName: freelancerName,
      projectId: project.id, projectTitle: project.title,
      participants: [clientUid, freelancerUid].sort(),
      lastMessage: '', updatedAt: new Date().toISOString()
    }, { merge: true });
    return convId;
  }

  // ---------- AUTH ----------
  async function handleAuth(action, payload) {
    if (action === 'signup') {
      const cred = await fb.createUserWithEmailAndPassword(auth, payload.email, payload.password);
      await fb.setDoc(fb.doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid, name: payload.name, email: payload.email,
        role: payload.role, profile: {}, createdAt: new Date().toISOString()
      });
      _me = null;
      return { token: cred.user.uid, user: { id: cred.user.uid, name: payload.name, email: payload.email, role: payload.role, profile: {} } };
    }
    if (action === 'login') {
      const cred = await fb.signInWithEmailAndPassword(auth, payload.email, payload.password);
      const snap = await fb.getDoc(fb.doc(db, 'users', cred.user.uid));
      if (!snap.exists) throw new Error('Profile missing. Sign up again.');
      const d = snap.data();
      _me = null;
      return { token: cred.user.uid, user: { id: cred.user.uid, name: d.name, email: d.email, role: d.role, profile: d.profile || {} } };
    }
    if (action === 'googleLogin') {
      const cred = await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
      const user = cred.user;
      const snap = await fb.getDoc(fb.doc(db, 'users', user.uid));
      let isNew = false, d;
      if (snap.exists) { d = snap.data(); }
      else {
        isNew = true;
        d = { uid: user.uid, name: user.displayName || 'Google User', email: user.email, role: null, profile: {}, createdAt: new Date().toISOString() };
        await fb.setDoc(fb.doc(db, 'users', user.uid), d);
      }
      _me = null;
      return { token: user.uid, isNew, user: { id: user.uid, name: d.name, email: d.email, role: d.role, profile: d.profile || {} } };
    }
    if (action === 'setRole') {
      await fb.updateDoc(fb.doc(db, 'users', uid()), { role: payload.role });
      _me = null;
      return { ok: true };
    }
    if (action === 'me') return await getMe(true);
    if (action === 'logout') { _me = null; await fb.signOut(auth); return { ok: true }; }
    if (action === 'updateProfile') {
      const snap = await fb.getDoc(fb.doc(db, 'users', uid()));
      const cur = snap.exists ? snap.data() : {};
      await fb.updateDoc(fb.doc(db, 'users', uid()), { profile: { ...(cur.profile || {}), ...payload } });
      _me = null;
      return { ok: true };
    }
    throw new Error('Unknown auth action');
  }

  // ---------- DATA (Firestore only) ----------
  async function dataCall(action, payload) {
    const me = await getMe();

    if (action === 'createProject') {
      const ref = await db.collection('projects').add({
        clientId: me.id, clientName: me.name, ...payload,
        status: 'open', proposalCount: 0, createdAt: new Date().toISOString()
      });
      return { id: ref.id };
    }

    if (action === 'listProjects') {
      let list = payload.mine
        ? await getDocs(db.collection('projects').where('clientId', '==', me.id))
        : await getDocs(db.collection('projects').where('status', '==', 'open'));
      if (payload.q) {
        const q = payload.q.toLowerCase();
        list = list.filter(p => (p.title + p.description + (p.skills || []).join(' ')).toLowerCase().includes(q));
      }
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    if (action === 'getProject') {
      const snap = await fb.getDoc(fb.doc(db, 'projects', payload.id));
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    if (action === 'sendProposal') {
      const proj = await dataCall('getProject', { id: payload.projectId });
      if (!proj) throw new Error('Project not found');
      if (proj.clientId === me.id) throw new Error("You can't propose on your own project");
      const ref = await db.collection('proposals').add({
        projectId: proj.id, freelancerId: me.id, freelancerName: me.name,
        amount: payload.amount, delivery: payload.delivery, message: payload.message,
        status: 'pending', createdAt: new Date().toISOString()
      });
      await fb.updateDoc(fb.doc(db, 'projects', proj.id), { proposalCount: (proj.proposalCount || 0) + 1 });
      await notify(proj.clientId, 'New proposal received', me.name + " proposed on \"" + proj.title + '"');
      return { id: ref.id };
    }

    if (action === 'listProposals') return getDocs(db.collection('proposals').where('projectId', '==', payload.projectId));

    if (action === 'myProposals') {
      const props = await getDocs(db.collection('proposals').where('freelancerId', '==', me.id));
      for (const p of props) {
        const snap = await fb.getDoc(fb.doc(db, 'projects', p.projectId));
        p.projectTitle = snap.exists ? snap.data().title : '';
      }
      return props;
    }

    if (action === 'acceptProposal') {
      const snap = await fb.getDoc(fb.doc(db, 'proposals', payload.proposalId));
      if (!snap.exists) throw new Error('Proposal not found');
      const pr = { id: snap.id, ...snap.data() };
      await fb.updateDoc(fb.doc(db, 'proposals', pr.id), { status: 'accepted' });
      const proj = await dataCall('getProject', { id: pr.projectId });
      await ensureConversation(proj, proj.clientId, proj.clientName, pr.freelancerId, pr.freelancerName);
      await notify(pr.freelancerId, 'Proposal accepted 🎉', 'Your proposal for "' + proj.title + '" was accepted. Chat is open!');
      return { ok: true };
    }

    if (action === 'rejectProposal') {
      const snap = await fb.getDoc(fb.doc(db, 'proposals', payload.proposalId));
      const pr = { id: snap.id, ...snap.data() };
      await fb.updateDoc(fb.doc(db, 'proposals', pr.id), { status: 'rejected' });
      await notify(pr.freelancerId, 'Proposal declined', 'Your proposal was not selected this time.');
      return { ok: true };
    }

    if (action === 'aiMatch') {
      const proj = await dataCall('getProject', { id: payload.projectId });
      if (!proj) throw new Error('Project not found');
      const freelancers = (await getDocs(db.collection('users').where('role', '==', 'freelancer')))
        .filter(u => u.uid !== me.id)
        .map(u => ({
          id: u.uid, name: u.name, title: u.profile.title || 'Freelancer',
          skills: u.profile.skills || [], hourlyRate: u.profile.hourlyRate || 50,
          rate: u.profile.hourlyRate || 50, experience: u.profile.experience || 0,
          rating: u.profile.rating || 4.5, reviews: u.profile.reviews || 0
        }));
      if (!freelancers.length) return [];

      try {
        const ranked = await realCall('aiMatch', { project: proj, freelancers });
        return ranked.map(r => {
          const f = freelancers.find(x => x.id === r.id) || {};
          const n = Math.round(Number(r.match) || 0);
          return { ...f, match: { overall: n, skills: n, exp: n, budget: n }, reason: r.reason };
        }).sort((a, b) => b.match.overall - a.match.overall);
      } catch (e) {
        console.warn('AI match failed, local fallback', e);
        return freelancers.map(f => ({ ...f, match: AI.computeMatch(proj, f) }))
          .sort((a, b) => b.match.overall - a.match.overall);
      }
    }

    if (action === 'aiNegotiate') {
      const proj = await dataCall('getProject', { id: payload.projectId });
      const fSnap = await fb.getDoc(fb.doc(db, 'users', payload.freelancerId));
      if (!proj || !fSnap.exists) throw new Error('Project or freelancer not found');
      const fd = fSnap.data();
      const freelancer = {
        id: fd.uid, name: fd.name,
        hourlyRate: fd.profile.hourlyRate || 50,
        skills: fd.profile.skills || [], experience: fd.profile.experience || 0
      };

      let result;
      try {
        result = await realCall('aiNegotiate', { project: proj, freelancer, clientBudget: proj.budget });
      } catch (e) {
        console.warn('AI negotiate failed, local fallback', e);
        result = AI.negotiate({
          clientBudget: proj.budget, freelancerRate: freelancer.hourlyRate,
          freelancerMin: freelancer.hourlyRate * 0.7, projectUrgency: proj.urgency, matchScore: 80
        });
      }

      const ref = await db.collection('offers').add({
        projectId: proj.id, projectTitle: proj.title,
        clientId: me.id, clientName: me.name,
        freelancerId: freelancer.id, freelancerName: freelancer.name,
        originalAmount: freelancer.hourlyRate, finalAmount: result.counterOffer,
        savings: result.savings, savingsPct: result.savingsPct,
        aiMessage: result.message, status: 'pending', createdAt: new Date().toISOString()
      });
      await notify(freelancer.id, 'New AI offer 💰', me.name + ' sent a negotiated offer for "' + proj.title + '"');
      return { offerId: ref.id, ...result };
    }

    if (action === 'listOffers') {
      const asClient = await getDocs(db.collection('offers').where('clientId', '==', me.id));
      const asFreelancer = await getDocs(db.collection('offers').where('freelancerId', '==', me.id));
      const merged = [...asClient, ...asFreelancer].filter((o, i, a) => a.findIndex(x => x.id === o.id) === i);
      merged.forEach(o => { o.otherParty = o.clientId === me.id ? o.freelancerName : o.clientName; });
      return merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    if (action === 'respondOffer') {
      const snap = await fb.getDoc(fb.doc(db, 'offers', payload.offerId));
      if (!snap.exists) throw new Error('Offer not found');
      const o = { id: snap.id, ...snap.data() };
      const status = payload.action === 'accept' ? 'accepted' : 'rejected';
      await fb.updateDoc(fb.doc(db, 'offers', o.id), { status });
      if (status === 'accepted') {
        const proj = await dataCall('getProject', { id: o.projectId });
        await ensureConversation(proj, o.clientId, o.clientName, o.freelancerId, o.freelancerName);
        const otherId = o.clientId === me.id ? o.freelancerId : o.clientId;
        await notify(otherId, 'Offer accepted ✅', me.name + ' accepted the offer for "' + o.projectTitle + '". Chat is open!');
      }
      return { ok: true };
    }

    if (action === 'listConversations') {
      const convs = await getDocs(db.collection('conversations').where('participants', 'array-contains', me.id));
      return convs.map(c => ({
        ...c,
        otherName: c.userA === me.id ? c.userBName : c.userAName,
        otherId: c.userA === me.id ? c.userB : c.userA
      })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }

    if (action === 'sendMessage') {
      await db.collection('messages').add({
        conversationId: payload.conversationId, senderId: me.id, senderName: me.name,
        text: payload.text, createdAt: new Date().toISOString()
      });
      await fb.updateDoc(fb.doc(db, 'conversations', payload.conversationId), {
        lastMessage: payload.text, updatedAt: new Date().toISOString()
      });
      const cSnap = await fb.getDoc(fb.doc(db, 'conversations', payload.conversationId));
      if (cSnap.exists) {
        const c = cSnap.data();
        await notify(c.userA === me.id ? c.userB : c.userA, 'New message', me.name + ': ' + payload.text.slice(0, 40));
      }
      return { ok: true };
    }

    if (action === 'getMessages') {
      const msgs = await getDocs(db.collection('messages').where('conversationId', '==', payload.conversationId));
      return msgs.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    }

    if (action === 'listNotifications') {
      const list = await getDocs(db.collection('notifications').where('userId', '==', me.id));
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    if (action === 'markNotifRead') {
      await fb.updateDoc(fb.doc(db, 'notifications', payload.id), { read: true });
      return { ok: true };
    }

    if (action === 'submitRating') {
      await db.collection('ratings').add({
        reviewerId: me.id, reviewerName: me.name, targetId: payload.targetId,
        rating: payload.rating, review: payload.review, createdAt: new Date().toISOString()
      });
      await notify(payload.targetId, 'New review ⭐', me.name + ' rated you ' + payload.rating + '/5');
      return { ok: true };
    }

    if (action === 'getRatings') return getDocs(db.collection('ratings').where('targetId', '==', payload.userId));

    throw new Error('Unknown action: ' + action);
  }

  // ---------- AI backend ----------
  async function realCall(action, payload) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ action, payload, token: uid(), ts: Date.now() }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'AI request failed');
    return data.data;
  }

  async function call(action, payload = {}) {
    try {
      if (['signup', 'login', 'googleLogin', 'setRole', 'me', 'logout', 'updateProfile'].includes(action)) {
        return await handleAuth(action, payload);
      }
      return await dataCall(action, payload);
    } catch (err) {
      console.error('[API]', action, err);
      throw err;
    }
  }

  return {
    signup: p => call('signup', p),
    login: p => call('login', p),
    googleLogin: () => call('googleLogin', {}),
    setRole: role => call('setRole', { role }),
    logout: () => call('logout'),
    me: () => call('me'),
    updateProfile: p => call('updateProfile', p),
    createProject: p => call('createProject', p),
    listProjects: p => call('listProjects', p || {}),
    getProject: id => call('getProject', { id }),
    sendProposal: p => call('sendProposal', p),
    listProposals: projectId => call('listProposals', { projectId }),
    myProposals: () => call('myProposals', {}),
    acceptProposal: p => call('acceptProposal', p),
    rejectProposal: p => call('rejectProposal', p),
    aiMatch: projectId => call('aiMatch', { projectId }),
    aiNegotiate: p => call('aiNegotiate', p),
    listOffers: () => call('listOffers', {}),
    respondOffer: p => call('respondOffer', p),
    listConversations: () => call('listConversations', {}),
    sendMessage: p => call('sendMessage', p),
    getMessages: p => call('getMessages', p),
    listNotifications: () => call('listNotifications', {}),
    markNotifRead: id => call('markNotifRead', { id }),
    submitRating: p => call('submitRating', p),
    getRatings: userId => call('getRatings', { userId }),
  };
})();