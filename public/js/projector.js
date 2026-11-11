/**
 * projector.js - Másodlagos Kivetítő Monitor (2. Monitor) kliensoldali logika (100% Offline)
 */

(function () {
  'use strict';

  let socket = null;
  let activeSessionId = null;

  // DOM Elemek
  const projQuizTitle = document.getElementById('proj-quiz-title');
  const projMetaInfo = document.getElementById('proj-meta-info');
  const projParticipantCounter = document.getElementById('proj-participant-counter');
  const projTimerBox = document.getElementById('proj-timer-box');
  const projTimerText = document.getElementById('proj-timer-text');
  const btnStartRace = document.getElementById('btn-start-race');

  const btnViewRace = document.getElementById('btn-view-race');
  const btnViewStats = document.getElementById('btn-view-stats');
  const viewSpaceRace = document.getElementById('view-space-race');
  const viewAnonStats = document.getElementById('view-anon-stats');
  const anonQuestionsList = document.getElementById('anon-questions-list');

  // Űrhajó elemek
  const rocketBlue = document.getElementById('rocket-blue');
  const rocketRed = document.getElementById('rocket-red');
  const rocketGreen = document.getElementById('rocket-green');
  const rocketYellow = document.getElementById('rocket-yellow');

  const scoreBlue = document.getElementById('score-blue');
  const scoreRed = document.getElementById('score-red');
  const scoreGreen = document.getElementById('score-green');
  const scoreYellow = document.getElementById('score-yellow');

  async function init() {
    if (typeof io !== 'undefined') {
      socket = io();
      setupSocket();
    }

    // Nézetváltó gombok
    btnViewRace.addEventListener('click', () => {
      btnViewRace.classList.add('active');
      btnViewRace.style.backgroundColor = '#2563eb';
      btnViewRace.style.color = '#ffffff';
      btnViewStats.classList.remove('active');
      btnViewStats.style.backgroundColor = 'transparent';
      btnViewStats.style.color = '#94a3b8';

      viewSpaceRace.style.display = 'block';
      viewAnonStats.style.display = 'none';
    });

    btnViewStats.addEventListener('click', () => {
      btnViewStats.classList.add('active');
      btnViewStats.style.backgroundColor = '#2563eb';
      btnViewStats.style.color = '#ffffff';
      btnViewRace.classList.remove('active');
      btnViewRace.style.backgroundColor = 'transparent';
      btnViewRace.style.color = '#94a3b8';

      viewSpaceRace.style.display = 'none';
      viewAnonStats.style.display = 'block';
    });

    if (btnStartRace) {
      btnStartRace.addEventListener('click', async () => {
        if (!activeSessionId) return;
        try {
          btnStartRace.disabled = true;
          btnStartRace.textContent = '🚀 Indítás...';
          const res = await fetch(`/api/admin/sessions/${activeSessionId}/start-race`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (res.ok) {
            btnStartRace.style.display = 'none';
          } else {
            const err = await res.json();
            alert('Hiba a verseny indításakor: ' + (err.error || 'Ismeretlen hiba'));
            btnStartRace.disabled = false;
            btnStartRace.textContent = '🚀 RAJT! Verseny indítása';
          }
        } catch (err) {
          console.error('Hiba a rajt indításakor:', err);
          btnStartRace.disabled = false;
          btnStartRace.textContent = '🚀 RAJT! Verseny indítása';
        }
      });
    }

    await findAndConnectSession();
  }

  function setupSocket() {
    socket.on('badges:updated', async (badges) => {
      if (!activeSessionId && badges.length > 0) {
        await findAndConnectSession();
      }
    });

    socket.on('race:started', () => {
      if (btnStartRace) btnStartRace.style.display = 'none';
    });

    socket.on('matrix:updated', (data) => {
      if (activeSessionId && String(data.session.id) === String(activeSessionId)) {
        updateProjector(data);
      }
    });

    socket.on('session:finished', (data) => {
      if (activeSessionId && String(data.sessionId) === String(activeSessionId)) {
        projMetaInfo.textContent = 'A dolgozat lezárult!';
        projTimerBox.style.display = 'none';
      }
    });
  }

  async function findAndConnectSession() {
    const urlSession = getUrlParam('session');

    try {
      const res = await fetch('/api/sessions/active');
      const activeSessions = await res.json();

      if (activeSessions.length === 0) {
        projQuizTitle.textContent = 'Röpdolgozat Kivetítő';
        projMetaInfo.textContent = 'Jelenleg nincs aktív futó dolgozat.';
        return;
      }

      let target = activeSessions[0];
      if (urlSession) {
        const found = activeSessions.find(s => String(s.id) === String(urlSession));
        if (found) target = found;
      }

      activeSessionId = target.id;
      projQuizTitle.textContent = target.quiz_title;
      projMetaInfo.textContent = `${target.subject_name} – ${target.grade_level}. évfolyam (${target.mode})`;

      // Csatlakozás a Socket szobához
      if (socket) {
        socket.emit('join:session', { sessionId: activeSessionId, role: 'teacher' });
      }

      // Kezdeti mátrix adatok lekérése
      const mRes = await fetch(`/api/admin/sessions/${activeSessionId}/matrix`);
      if (mRes.ok) {
        const matrixData = await mRes.json();
        updateProjector(matrixData);
      }

    } catch (err) {
      console.error('Hiba a kivetítő kapcsolódásakor:', err);
    }
  }

  function updateProjector(data) {
    const { session, participants, questions, answers, totalMaxPoints } = data;

    projQuizTitle.textContent = session.quiz_title;
    projMetaInfo.textContent = `${session.subject_name} – ${session.grade_level}. évfolyam (${session.mode})`;
    projParticipantCounter.textContent = `${participants.length} résztvevő diák`;

    // RAJT gomb láthatósága (Space Race módban a rajt előtt)
    if (btnStartRace) {
      const isSpaceRace = session.mode === 'SPACE_RACE';
      const isWaitingForRace = isSpaceRace && (!session.current_question_index || session.current_question_index === 0);
      btnStartRace.style.display = isWaitingForRace ? 'inline-flex' : 'none';
    }

    // 1. SPACE RACE CSAPATOK SZÁMÍTÁSA
    const teams = {
      'Kék': { points: 0, count: 0 },
      'Piros': { points: 0, count: 0 },
      'Zöld': { points: 0, count: 0 },
      'Sárga': { points: 0, count: 0 }
    };

    participants.forEach(p => {
      const color = p.team_color || 'Kék';
      if (teams[color]) {
        teams[color].points += p.total_points;
        teams[color].count += 1;
      }
    });

    // Haladási százalék: a csapatban lévő diákok maximális lehetséges pontszámához viszonyítva
    function calcTeamPct(color) {
      const t = teams[color];
      if (!t || t.count === 0 || totalMaxPoints === 0) return 0;
      const maxPossible = t.count * totalMaxPoints;
      const pct = Math.round((t.points / maxPossible) * 100);
      return Math.min(90, Math.max(0, pct)); // 90% a pálya vége, hogy ne fusson ki az űrhajó
    }

    // Űrhajók pozíciójának beállítása
    rocketBlue.style.left = `${calcTeamPct('Kék')}%`;
    scoreBlue.textContent = `${teams['Kék'].points.toFixed(1)} pont (${teams['Kék'].count} fő)`;

    rocketRed.style.left = `${calcTeamPct('Piros')}%`;
    scoreRed.textContent = `${teams['Piros'].points.toFixed(1)} pont (${teams['Piros'].count} fő)`;

    rocketGreen.style.left = `${calcTeamPct('Zöld')}%`;
    scoreGreen.textContent = `${teams['Zöld'].points.toFixed(1)} pont (${teams['Zöld'].count} fő)`;

    rocketYellow.style.left = `${calcTeamPct('Sárga')}%`;
    scoreYellow.textContent = `${teams['Sárga'].points.toFixed(1)} pont (${teams['Sárga'].count} fő)`;

    // 2. ANONIM KÉRDÉS-STATISZTIKA
    anonQuestionsList.innerHTML = '';
    questions.forEach((q, idx) => {
      const qAnswers = answers.filter(a => a.question_id === q.id);
      const totalAnswers = qAnswers.length;
      const correctAnswers = qAnswers.filter(a => a.is_correct === 1).length;
      const successRate = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="font-size: 1.1rem;">${idx + 1}. kérdés: ${formatCode(q.question_text)}</h4>
          <span style="font-size: 1.1rem; font-weight: 700; color: ${successRate >= 60 ? '#4ade80' : '#f87171'};">
            ${successRate}% (${correctAnswers} / ${totalAnswers} diák)
          </span>
        </div>
        <div class="stat-bar-bg">
          <div class="stat-bar-fill" style="width: ${successRate}%; background-color: ${successRate >= 60 ? '#22c55e' : '#ef4444'};"></div>
        </div>
      `;
      anonQuestionsList.appendChild(card);
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();

