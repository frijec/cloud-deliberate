/* ============================================================
   CONSID · CLOUD DELIBERATE — cloud-tjekket.

   A six-question lead qualifier. Loaded only by /cloud-tjek/.

   Two axes, not a ladder. The sibling site (Directed Agentic
   Delivery) scores one maturity ladder, Niveau 0-3, because its
   proposition is climbing it. This site has no ladder: Assessment,
   Workshop and Enablement are three shapes of engagement, and the
   site presents them as a ring. So the answers place a visitor on a
   grid instead, and the grid picks the offering:

       eksponering  how much cloud, moving how fast   (Q1-Q2)
       bevidsthed   how deliberate the decisions are  (Q3-Q6)

   Q3-Q6 are one question per principle, in the order the homepage
   lists them, so the weakest answer names a principle the visitor
   can go read.

   The fourth quadrant (low exposure, high deliberateness) returns no
   offering at all. Telling a visitor they do not need us yet is the
   point of qualifying rather than collecting.
   ============================================================ */
(function () {
  const root = document.getElementById('tjek');
  if (!root) return;
  const REDUCED_TJEK = typeof REDUCED !== 'undefined' ? REDUCED : matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Where the qualified lead goes ---------------------------------
     No backend yet. Until one exists, submit hands off through the same
     pre-filled mail the rest of the site uses, carrying the answers in
     the body so nothing is lost. Point ENDPOINT at the API and the fetch
     path below takes over; the payload is already the shape it expects. */
  const ENDPOINT = null;              // e.g. '/api/public/cloud-tjek'
  const MAILTO = 'anders.bendtsen@consid.com';

  const QUESTIONS = [
    {
      axis: 'eksponering',
      text: 'Hvor stor en del af jeres it-landskab kører i public cloud i dag?',
      options: [
        'Under 10 %. Enkelte services ligger i cloud, resten kører andre steder',
        'Omkring en fjerdedel. Nye projekter starter i cloud, arven ligger on-premises',
        'Omkring halvdelen. Både cloud og on-premises er driftskritiske',
        'Det meste. Cloud er den primære platform for det, der betyder noget'
      ]
    },
    {
      axis: 'eksponering',
      text: 'Hvordan har jeres cloud-regning udviklet sig de seneste 12 måneder?',
      options: [
        'Den er stabil og nogenlunde som budgetteret',
        'Den vokser, men i takt med at vi bruger mere',
        'Den vokser hurtigere end forbruget, og vi kan ikke helt forklare hvorfor',
        'Den er blevet et fast punkt på ledelsesmøder'
      ]
    },
    {
      axis: 'bevidsthed',
      principle: 'Cloud-native overalt',
      text: 'Hvordan bliver jeres cloud-infrastruktur oprettet og ændret i dag?',
      options: [
        'Manuelt i konsollen. Den der har adgang, klikker det på plads',
        'Delvist i kode, med manuelle trin og uden fælles praksis',
        'Infrastructure as code i de fleste miljøer, reviewet som al anden kode',
        'Alt i kode, deployet af pipelines, og rutinedriften kører automatisk'
      ]
    },
    {
      axis: 'bevidsthed',
      principle: 'Klarhed før handling',
      text: 'Kan I gøre rede for, hvorfor hver større arbejdslast ligger, hvor den ligger?',
      options: [
        'Nej. Placeringen er sjældent et bevidst valg, den er bare blevet sådan',
        'For nogle af dem, og begrundelsen ligger hos dem der traf beslutningen',
        'For de fleste, og begrundelsen er skrevet ned et sted, vi kan finde den',
        'Ja. Beslutningerne er dokumenteret med kontekst og alternativer, og de bliver taget op igen'
      ]
    },
    {
      axis: 'bevidsthed',
      principle: 'Robust, klar til at justere',
      text: 'Hvad skulle der til, hvis I skulle flytte en driftskritisk arbejdslast til et andet miljø?',
      options: [
        'Det ved vi ikke. Vi har aldrig undersøgt det',
        'Et større projekt. Vi ville opdage afhængighederne undervejs',
        'Vi kender afhængighederne, og det kunne lade sig gøre med planlægning',
        'Vi har designet for det. Data er portable, og mønstrene fungerer på tværs af miljøer'
      ]
    },
    {
      axis: 'bevidsthed',
      principle: 'Gør det rigtige valg let',
      text: 'Hvordan vælger et team de services og mønstre, de bygger på?',
      options: [
        'Hvert team vælger selv, og valgene ligner ikke hinanden',
        'Der findes anbefalinger, men de er uskrevne og bliver fulgt ujævnt',
        'Vi har definerede standarder for de almindelige opgaver',
        'Standarderne er den lette vej at gå, og afvigelser er synlige og begrundede'
      ]
    }
  ];

  // Clarity first: a team that cannot say why a workload sits where it
  // does cannot act on any of the others. Then the standards that make
  // the right choice cheap, then automation, then reversibility.
  const PRINCIPLE_PRIORITY = [
    'Klarhed før handling',
    'Gør det rigtige valg let',
    'Cloud-native overalt',
    'Robust, klar til at justere'
  ];

  const RESULTS = {
    assessment: {
      quadrant: 'Stor eksponering, få bevidste valg',
      title: 'I kører på autopilot i en skala, hvor det koster',
      body: 'Jeres cloud fylder nok til, at beslutningerne betyder penge, og de bliver i vid udstrækning truffet uden et fælles grundlag. Det første skridt er at få tallene og beslutningerne på bordet, så I ved hvad der rent faktisk er valgt.',
      ydelse: { navn: 'Cloud Deliberate Assessment', timer: '32 timer', href: '../ydelser/assessment.html' }
    },
    enablement: {
      quadrant: 'Stor eksponering, bevidste valg',
      title: 'I ved hvad godt ser ud. Det skalerer bare ikke endnu',
      body: 'I træffer bevidste cloud-beslutninger, og landskabet er stort nok til, at det skal kunne køre uden at I holder hånden under det hver dag. Det der mangler, er maskineriet til at gøre praksis til hverdag.',
      ydelse: { navn: 'Cloud Deliberate Enablement', timer: '64 timer', href: '../ydelser/enablement.html' }
    },
    workshop: {
      quadrant: 'Begrænset eksponering, få bevidste valg',
      title: 'I er tidligt nok til at sætte kursen billigt',
      body: 'Jeres cloud-landskab er stadig til at overskue. Det er det bedste tidspunkt at blive enige om, hvordan beslutningerne skal træffes, mens det koster timer frem for migreringer.',
      ydelse: { navn: 'Cloud Deliberate Arkitektur-workshop', timer: '14 timer', href: '../ydelser/arkitektur-workshop.html' }
    },
    ingen: {
      quadrant: 'Begrænset eksponering, bevidste valg',
      title: 'I har fat i det, der skal til',
      body: 'Beslutningerne er bevidste, og landskabet er ikke stort nok til, at et forløb ville tjene sig hjem lige nu. Tag whitepaperet, og kom tilbage når cloud fylder mere hos jer, eller når I står med en beslutning I ikke kan blive enige om.',
      ydelse: null
    }
  };

  const AXIS_LABELS = ['Lav', 'Begrænset', 'Betydelig', 'Høj'];

  function computeScores(answers) {
    const exposure = answers.slice(0, 2);
    const aware = answers.slice(2, 6);
    // Exposure is a plain reading of scale, so it rounds. Deliberateness
    // floors: a team is only as deliberate as the practice it is weakest
    // at, and a flattering score here would waste everyone's meeting.
    const eksponering = Math.round(exposure.reduce((a, b) => a + b, 0) / exposure.length);
    const bevidsthed = Math.floor(aware.reduce((a, b) => a + b, 0) / aware.length);

    const lowest = Math.min.apply(null, aware);
    const candidates = QUESTIONS.slice(2, 6)
      .filter((q, i) => aware[i] === lowest)
      .map(q => q.principle);
    const limiting = PRINCIPLE_PRIORITY.filter(p => candidates.indexOf(p) !== -1)[0] || candidates[0] || null;

    let key;
    if (eksponering >= 2) key = bevidsthed >= 2 ? 'enablement' : 'assessment';
    else key = bevidsthed >= 2 ? 'ingen' : 'workshop';

    return { eksponering, bevidsthed, limiting, key };
  }

  /* ---- Stage machine -------------------------------------------------- */

  const stages = [].slice.call(root.querySelectorAll('.tjek-stage'));
  function showStage(name) {
    stages.forEach(s => s.classList.toggle('is-active', s.dataset.stage === name));
    const el = root.querySelector('.tjek-stage[data-stage="' + name + '"]');
    if (!REDUCED_TJEK) { el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }
    const heading = el.querySelector('[data-focus]');
    if (heading) heading.focus();
  }

  /* ---- Quiz ------------------------------------------------------------ */

  let current = 0;
  const answers = QUESTIONS.map(() => null);
  const progressLab = document.getElementById('tjek-progress');
  const barFill = document.getElementById('tjek-bar');
  const backBtn = document.getElementById('tjek-back');
  const questionEl = document.getElementById('tjek-question');
  const optionsEl = document.getElementById('tjek-options');

  function renderQuestion(i) {
    const q = QUESTIONS[i];
    progressLab.textContent = 'Spørgsmål ' + (i + 1) + ' af ' + QUESTIONS.length;
    barFill.style.width = ((i + 1) / QUESTIONS.length * 100) + '%';
    barFill.parentElement.setAttribute('aria-valuenow', String(i + 1));
    backBtn.hidden = i === 0;
    questionEl.textContent = q.text;
    optionsEl.innerHTML = '';
    q.options.forEach((opt, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tjek__opt' + (answers[i] === idx ? ' is-selected' : '');
      b.setAttribute('aria-pressed', String(answers[i] === idx));
      const lab = document.createElement('span');
      lab.className = 'tjek__opt__lab';
      lab.textContent = ['A', 'B', 'C', 'D'][idx];
      const txt = document.createElement('span');
      txt.textContent = opt;
      b.append(lab, txt);
      b.addEventListener('click', () => selectAnswer(idx));
      optionsEl.appendChild(b);
    });
    questionEl.focus();
  }

  function selectAnswer(score) {
    answers[current] = score;
    renderQuestion(current);
    const advance = () => {
      if (current === QUESTIONS.length - 1) finishQuiz();
      else { current += 1; renderQuestion(current); }
    };
    // A beat so the chosen answer registers before the question changes.
    if (REDUCED_TJEK) advance(); else setTimeout(advance, 190);
  }

  backBtn.addEventListener('click', () => { if (current > 0) { current -= 1; renderQuestion(current); } });
  document.getElementById('tjek-start').addEventListener('click', () => {
    current = 0;
    renderQuestion(0);
    showStage('quiz');
  });

  /* ---- Result ---------------------------------------------------------- */

  let scores = null;

  function finishQuiz() {
    scores = computeScores(answers);
    const r = RESULTS[scores.key];

    root.querySelector('[data-quad]').textContent = r.quadrant;
    root.querySelector('[data-result-title]').textContent = r.title;
    root.querySelector('[data-result-body]').textContent = r.body;
    root.querySelector('[data-axis-eksponering]').textContent = AXIS_LABELS[scores.eksponering];
    root.querySelector('[data-axis-bevidsthed]').textContent = AXIS_LABELS[scores.bevidsthed];

    const limitEl = root.querySelector('[data-limiting]');
    if (scores.limiting && scores.bevidsthed < 3) {
      limitEl.hidden = false;
      limitEl.querySelector('[data-limiting-name]').textContent = scores.limiting;
    } else {
      limitEl.hidden = true;
    }

    root.querySelectorAll('.tjek-quad__cell').forEach(c =>
      c.classList.toggle('is-you', c.dataset.cell === scores.key));

    const ydelseEl = root.querySelector('[data-ydelse]');
    const noneEl = root.querySelector('[data-ingen]');
    if (r.ydelse) {
      ydelseEl.hidden = false;
      noneEl.hidden = true;
      ydelseEl.querySelector('[data-ydelse-navn]').textContent = r.ydelse.navn;
      ydelseEl.querySelector('[data-ydelse-timer]').textContent = r.ydelse.timer;
      ydelseEl.querySelector('[data-ydelse-link]').href = r.ydelse.href;
    } else {
      ydelseEl.hidden = true;
      noneEl.hidden = false;
    }

    // The fourth quadrant is told plainly that a forløb would not pay for
    // itself yet, so it is not asked to fill in a qualification form.
    root.querySelector('[data-to-form]').hidden = !r.ydelse;
    showStage('result');
  }

  root.querySelector('[data-to-form]').addEventListener('click', () => showStage('form'));
  root.querySelector('[data-restart]').addEventListener('click', () => {
    current = 0;
    answers.fill(null);
    renderQuestion(0);
    showStage('quiz');
  });

  /* ---- Lead form ------------------------------------------------------- */

  const form = document.getElementById('tjek-form');
  const errEl = document.getElementById('tjek-error');
  const submitBtn = document.getElementById('tjek-submit');

  const answerLines = () => QUESTIONS.map((q, i) =>
    (i + 1) + '. ' + q.text + '\n   → ' + (answers[i] === null ? '(ubesvaret)' : q.options[answers[i]])).join('\n');

  function buildPayload() {
    const v = id => (document.getElementById(id).value || '').trim();
    return {
      company: v('tj-company'),
      role: v('tj-role'),
      cloud_spend: document.getElementById('tj-spend').value,
      platforms: v('tj-platforms'),
      biggest_challenge: v('tj-challenge'),
      conversation_value: v('tj-value'),
      email: v('tj-email'),
      answers: answers.slice(),
      scores: {
        eksponering: scores.eksponering,
        bevidsthed: scores.bevidsthed,
        limiting_principle: scores.limiting,
        recommendation: scores.key
      },
      source: 'cloud-tjek',
      company_website: v('tj-website')   // honeypot
    };
  }

  function mailtoHandoff(p) {
    const body = [
      'Anbefaling: ' + p.scores.recommendation,
      'Eksponering: ' + AXIS_LABELS[p.scores.eksponering] + ' (' + p.scores.eksponering + '/3)',
      'Bevidsthed: ' + AXIS_LABELS[p.scores.bevidsthed] + ' (' + p.scores.bevidsthed + '/3)',
      'Begrænsende princip: ' + (p.scores.limiting_principle || '—'),
      '',
      'Navn/firma: ' + (p.company || '—'),
      'Rolle: ' + (p.role || '—'),
      'E-mail: ' + p.email,
      'Cloud-forbrug: ' + p.cloud_spend,
      'Platforme: ' + (p.platforms || '—'),
      'Største udfordring: ' + (p.biggest_challenge || '—'),
      'Hvad gør samtalen værdifuld: ' + (p.conversation_value || '—'),
      '',
      'Svar:',
      answerLines(),
      '',
      'Sendt fra ' + location.origin + location.pathname
    ].join('\n');
    location.href = 'mailto:' + MAILTO
      + '?subject=' + encodeURIComponent('Cloud-tjek — ' + (p.company || p.email))
      + '&body=' + encodeURIComponent(body);
  }

  function done() {
    form.hidden = true;
    const d = document.getElementById('tjek-done');
    d.hidden = false;
    d.focus();
  }

  function submitTjek(payload) {
    if (!ENDPOINT) { mailtoHandoff(payload); done(); return; }
    submitBtn.disabled = true;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data && data.error) || 'Kunne ikke sende');
        done();
      })
      .catch(err => {
        submitBtn.disabled = false;
        errEl.textContent = err.message + '. Prøv igen, eller skriv til ' + MAILTO + '.';
        errEl.hidden = false;
      });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    errEl.hidden = true;
    const email = document.getElementById('tj-email');
    if (!email.value.trim() || !email.checkValidity()) {
      email.setAttribute('aria-invalid', 'true');
      errEl.textContent = 'Skriv en e-mail vi kan svare på.';
      errEl.hidden = false;
      email.focus();
      return;
    }
    email.removeAttribute('aria-invalid');
    submitTjek(buildPayload());
  });
})();
