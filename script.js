// ============================================
// PREVENIR PULL-TO-REFRESH NO CELULAR + HEARTBEAT + DETECÇÃO DE SAÍDA IMEDIATA
// ============================================
(function () {
  let startY = 0;
  let currentY = 0;
  let intervaloPing = null;
  let heartbeatAtivo = false;
  let horarioInicioGlobal = Date.now();
  let saidaRegistrada = false;
  
  const WEBHOOK_URL = "https://script.google.com/macros/s/SEU_ID_AQUI/exec";
  
  // Função para obter o nome atualizado
  function getNomeAtual() {
    return localStorage.getItem("usuario") || null;
  }

  const PLANILHA_URL =
  "https://script.google.com/macros/s/AKfycbxEbNhaNQStUDL-PiTSGUTzKclZQXpn6NpFqY6u4rL-JVrwuwEU8GsU8nw03KE5hC02/exec";

  function iniciarHeartbeat() {
    if (heartbeatAtivo) {
      return;
    }
    
    const nome = getNomeAtual();
    if (!nome) {
      console.log("⏳ Aguardando login para iniciar heartbeat...");
      return;
    }
    
    if (intervaloPing) clearInterval(intervaloPing);
    
    heartbeatAtivo = true;
    console.log("💓 Iniciando heartbeat para:", nome);
    
    intervaloPing = setInterval(() => {
      enviarPing();
    }, 30000);
  }

  function enviarPing() {
    const nome = getNomeAtual();
    if (!nome) return;
    
    fetch(PLANILHA_URL, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: JSON.stringify({
        tipo: "HEARTBEAT",
        nome: nome,
        fase_atual: typeof currentPhase !== 'undefined' ? currentPhase : 0,
        pontuacao_atual: typeof score !== 'undefined' ? score : 0,
        timestamp: Date.now(),
      }),
    }).catch(e => console.log("Heartbeat error:", e));
  }

  function enviarStatus(motivo) {
    const nome = getNomeAtual();
    if (!nome) return;
    
    fetch(PLANILHA_URL, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: JSON.stringify({
        tipo: "STATUS",
        nome: nome,
        motivo: motivo,
        fase_atual: typeof currentPhase !== 'undefined' ? currentPhase : 0,
        pontuacao_atual: typeof score !== 'undefined' ? score : 0,
        tempo_ativo: Math.floor((Date.now() - horarioInicioGlobal) / 1000),
        timestamp: Date.now()
      }),
    }).catch(e => console.log("Status error:", e));
  }

  // ⭐ FUNÇÃO DE SAÍDA IMEDIATA MELHORADA ⭐
  function registrarSaida(motivo) {
    if (saidaRegistrada) {
      return;
    }
    
    const nome = getNomeAtual();
    if (!nome) {
      console.log("⚠️ Saída sem nome registrado (possível visitante)");
      return;
    }
    
    saidaRegistrada = true;
    console.log(`🚪 SAÍDA IMEDIATA: ${motivo} - ${nome}`);
    
    const dados = {
      tipo: "SAIU_DO_JOGO",
      nome: nome,
      motivo: motivo,
      fase_atual: typeof currentPhase !== 'undefined' ? currentPhase : 0,
      pontuacao_atual: typeof score !== 'undefined' ? score : 0,
      tempo_total: Math.floor((Date.now() - horarioInicioGlobal) / 1000),
      conjunto_ativo: typeof activeQuestionSet !== 'undefined' ? activeQuestionSet : "original",
      timestamp: Date.now()
    };
    
    // Tenta enviar com sendBeacon (melhor para fechamento de página)
    const blob = new Blob([JSON.stringify(dados)], {type: "application/json"});
    let enviado = false;
    
    if (navigator.sendBeacon) {
      enviado = navigator.sendBeacon(PLANILHA_URL, blob);
      if (enviado) console.log("📡 Saída enviada via sendBeacon");
    }
    
    // Se sendBeacon falhou ou não está disponível, tenta fetch normal
    if (!enviado) {
      fetch(PLANILHA_URL, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      }).catch(e => console.log("Erro no fetch da saída:", e));
    }
    
    // Parar heartbeat
    if (intervaloPing) {
      clearInterval(intervaloPing);
      heartbeatAtivo = false;
    }
  }

  // ⭐ EVENTOS DE SAÍDA - MÚLTIPLOS MÉTODOS ⭐
  
  // 1. Fechamento normal da página (MAIS IMPORTANTE)
  window.addEventListener("beforeunload", () => {
    registrarSaida("fechou_aba");
  });
  
  // 2. Recarregamento da página
  window.addEventListener("pagehide", () => {
    registrarSaida("recarregou_pagina");
  });
  
  // 3. Unload (fallback)
  window.addEventListener("unload", () => {
    registrarSaida("unload_event");
  });
  
  // 4. Perda de visibilidade da aba
  let timeoutOculto;
  document.addEventListener("visibilitychange", () => {
    const nome = getNomeAtual();
    if (!nome) return;
    
    if (document.hidden) {
      console.log("📱 Aba ficou oculta");
      enviarStatus("background");
      
      if (intervaloPing) {
        clearInterval(intervaloPing);
        heartbeatAtivo = false;
      }
      
      // Se ficar oculto por mais de 10 segundos, registrar saída
      timeoutOculto = setTimeout(() => {
        if (document.hidden && !saidaRegistrada) {
          registrarSaida("aba_oculta_prolongada");
        }
      }, 10000);
      
    } else {
      // Voltou - cancelar saída pendente
      if (timeoutOculto) clearTimeout(timeoutOculto);
      console.log("🔄 Aba voltou a ficar visível");
      saidaRegistrada = false;
      iniciarHeartbeat();
      enviarStatus("retornou_aba");
    }
  });
  
  // 5. App minimizado (mobile)
  window.addEventListener("blur", () => {
    console.log("📱 App perdeu foco");
    setTimeout(() => {
      if (document.hidden && !saidaRegistrada) {
        registrarSaida("app_minimizado");
      }
    }, 2000);
  });
  
  // 6. Para Android Chrome
  if ('onpause' in window) {
    window.addEventListener("pause", () => {
      registrarSaida("app_pausado_android");
    });
  }
  
  // 7. Perda de conexão
  window.addEventListener("offline", () => {
    registrarSaida("perdeu_conexao");
  });

  // Prevenir pull-to-refresh
  function preventPullToRefresh(e) {
    const scrollable = e.target.closest("#quiz-container, #answers, body") || document.body;
    const isScrollable = scrollable.scrollHeight > scrollable.clientHeight;

    if (!isScrollable) {
      e.preventDefault();
      return;
    }

    const scrollTop = scrollable.scrollTop;

    if (scrollTop === 0 && currentY - startY > 0) {
      e.preventDefault();
      return;
    }

    if (scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1 && currentY - startY < 0) {
      e.preventDefault();
      return;
    }
  }

  document.addEventListener("touchstart", function (e) {
    startY = e.touches[0].clientY;
  }, { passive: false });

  document.addEventListener("touchmove", function (e) {
    currentY = e.touches[0].clientY;
    preventPullToRefresh(e);
  }, { passive: false });
  
  // API para controle externo
  window.heartbeatAPI = {
    iniciar: iniciarHeartbeat,
    parar: () => {
      if (intervaloPing) clearInterval(intervaloPing);
      heartbeatAtivo = false;
    },
    atualizarNome: (nome) => {
      if (nome) {
        horarioInicioGlobal = Date.now();
        saidaRegistrada = false;
        iniciarHeartbeat();
      }
    },
    resetarTempo: () => {
      horarioInicioGlobal = Date.now();
      saidaRegistrada = false;
    }
  };
})();

// ============================================
// CONFIGURAÇÕES DO QUIZ
// ============================================

const phaseLimits = [20, 40, 60]; // Primeira fase: 20 perguntas, segunda: +20, terceira: +20 (total 60)

let currentPhase = 1;
let currentIndex = 0;
let score = 0;
let currentQuestions = [];
let activeQuestionSet = "original";
let allQuestions = [];
let jogadorAtivo = false;
let nomeDoJogador = null;

// Variável global
window.horarioInicio = Date.now();

// ============================================
// SUAS PERGUNTAS (originalQuestions e newQuestions)
// Mantenha exatamente como você já tem - já estão declaradas acima
// ============================================

// (Suas perguntas originais e newQuestions já estão aqui - não vou copiar para não repetir)

activeQuestionSet = "original";

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function alternarConjuntoPerguntas(conjunto) {
  if (conjunto === "original") {
    allQuestions = [...originalQuestions];
    activeQuestionSet = "original";
    const infoEl = document.getElementById("conjunto-info");
    if (infoEl) infoEl.innerHTML = "📚 Conjunto ativo: PERGUNTAS ORIGINAIS";
    console.log("✅ Conjunto ORIGINAL ativado");
  } else if (conjunto === "new") {
    allQuestions = [...newQuestions];
    activeQuestionSet = "new";
    const infoEl = document.getElementById("conjunto-info");
    if (infoEl)
      infoEl.innerHTML = "📚 Conjunto ativo: PERGUNTAS SUPERS DIFÍCEIS";
    console.log("✅ Conjunto NOVO ativado");
  }

  const quizContainer = document.getElementById("quiz-container");
  const startScreen = document.getElementById("start-screen");
  if (quizContainer && !quizContainer.classList.contains("hidden")) {
    if (confirm("Você quer mudar o conjunto de perguntas? O quiz será reiniciado.")) {
      if (startScreen) startScreen.classList.remove("hidden");
      if (quizContainer) quizContainer.classList.add("hidden");
    }
  }
}

async function enviarParaPlanilha(dados) {
  try {
    const usuario = localStorage.getItem("usuario") || "Anônimo";
    if (!dados.nome) dados.nome = usuario;

    console.log("📤 Enviando para planilha:", dados.tipo || "RESPOSTA");

    await fetch(PLANILHA_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

    const backupKey = `backup_${usuario}`;
    const backups = JSON.parse(localStorage.getItem(backupKey) || "[]");
    backups.push({ ...dados, data_backup: new Date().toISOString() });
    if (backups.length > 100) backups.shift();
    localStorage.setItem(backupKey, JSON.stringify(backups));
  } catch (erro) {
    console.error("❌ Erro no envio:", erro);
  }
}

async function registrarJogadorInicio(nome) {
  try {
    console.log("📝 Registrando jogador:", nome);
    await fetch(PLANILHA_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome,
        tipo: "REGISTRO_INICIAL",
        timestamp: new Date().toISOString(),
        mensagem: "Jogador entrou no quiz",
        conjunto_ativo: activeQuestionSet,
      }),
    });
    console.log("✅ Jogador registrado na planilha!");
  } catch (erro) {
    console.error("❌ Erro ao registrar jogador:", erro);
  }
}

// ============================================
// FUNÇÕES DO QUIZ
// ============================================
function startPhase(phase) {
  currentPhase = phase;
  currentIndex = 0;
  score = 0;

  const resultEl = document.getElementById("result");
  const nextPhaseBtn = document.getElementById("next-phase-btn");
  if (resultEl) resultEl.classList.add("hidden");
  if (nextPhaseBtn) nextPhaseBtn.classList.add("hidden");

  const start = phase === 1 ? 0 : phaseLimits[phase - 2];
  const end = phaseLimits[phase - 1];
  currentQuestions = shuffleArray([...allQuestions.slice(start, end)]);

  const phaseInfo = document.getElementById("phase-info");
  if (phaseInfo)
    phaseInfo.textContent = `📖 Fase ${currentPhase} - ${currentQuestions.length} perguntas`;

  showQuestion();
}

function showQuestion() {
  const question = currentQuestions[currentIndex];
  const questionEl = document.getElementById("question");
  const answersEl = document.getElementById("answers");
  const nextBtn = document.getElementById("next-btn");

  if (questionEl) questionEl.textContent = question.question;
  if (answersEl) {
    answersEl.innerHTML = "";
    question.answers.forEach((answer) => {
      const btn = document.createElement("button");
      btn.textContent = answer.text;
      btn.onclick = () => checkAnswer(btn, answer.correct);
      answersEl.appendChild(btn);
    });
  }
  if (nextBtn) nextBtn.classList.add("hidden");
}

function checkAnswer(button, isCorrect) {
  const answersEl = document.getElementById("answers");
  const buttons = answersEl ? answersEl.querySelectorAll("button") : [];
  const usuario = localStorage.getItem("usuario") || "Anônimo";
  const perguntaAtual = currentQuestions[currentIndex].question;
  const respostaSelecionada = button.textContent;
  const totalPerguntasFase = currentQuestions.length;

  buttons.forEach((btn) => (btn.disabled = true));

  if (isCorrect) {
    button.style.backgroundColor = "#2e7d32";
    score++;
  } else {
    button.style.backgroundColor = "#c62828";
    const currentQ = currentQuestions[currentIndex];
    buttons.forEach((btn, idx) => {
      if (currentQ.answers[idx].correct) {
        btn.style.backgroundColor = "#2e7d32";
      }
    });
  }

  enviarParaPlanilha({
    nome: usuario,
    tipo: "RESPOSTA",
    fase: currentPhase,
    pergunta: perguntaAtual,
    resposta: respostaSelecionada,
    acertou: isCorrect,
    pontuacao: score,
    total: totalPerguntasFase,
    timestamp: new Date().toISOString(),
    conjunto: activeQuestionSet,
  });

  const nextBtn = document.getElementById("next-btn");
  if (nextBtn) nextBtn.classList.remove("hidden");
}

function showResult() {
  const questionEl = document.getElementById("question");
  const answersEl = document.getElementById("answers");
  const resultEl = document.getElementById("result");
  const nextPhaseBtn = document.getElementById("next-phase-btn");

  if (questionEl) questionEl.textContent = "";
  if (answersEl) answersEl.innerHTML = "";
  if (resultEl) resultEl.classList.remove("hidden");

  const usuario = localStorage.getItem("usuario") || "Anônimo";
  const total = currentQuestions.length;
  const acertos = score;
  const acertoPercent = Math.round((acertos / total) * 100);

  enviarParaPlanilha({
    nome: usuario,
    tipo: "RESULTADO_FINAL_FASE",
    fase: currentPhase,
    pontuacao_final: acertos,
    total_perguntas: total,
    percentual_acerto: acertoPercent,
    aprovado: acertoPercent >= 60,
    timestamp: new Date().toISOString(),
    conjunto: activeQuestionSet,
  });

  if (acertoPercent >= 60 && currentPhase < phaseLimits.length) {
    if (resultEl)
      resultEl.innerHTML = `✅ Parabéns! Você acertou ${acertos}/${total} (${acertoPercent}%).<br>🚀 Você pode avançar para a próxima fase!`;
    if (nextPhaseBtn) nextPhaseBtn.classList.remove("hidden");
  } else if (acertoPercent >= 60) {
    if (resultEl)
      resultEl.innerHTML = `🏆 PARABÉNS! Você completou o QUIZ!<br>⭐ Acertos: ${acertos}/${total} (${acertoPercent}%) ⭐`;

    enviarParaPlanilha({
      nome: usuario,
      tipo: "CONCLUIU_QUIZ",
      pontuacao_total: acertos,
      percentual_global: acertoPercent,
      timestamp: new Date().toISOString(),
      conjunto: activeQuestionSet,
    });
  } else {
    if (resultEl)
      resultEl.innerHTML = `📚 Você acertou ${acertos}/${total} (${acertoPercent}%).<br>⚠️ Precisa de 60% para avançar. Tente novamente!`;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  allQuestions = [ {
    question:
      "(1) A quem Paulo chamou de 'meu companheiro de lutas' (Filemon 1:2)?",
    answers: [
      { text: "Apolo", correct: false },
      { text: "Afia", correct: false },
      { text: "Arquipo", correct: true },
      { text: "Adonias", correct: false },
    ],
  },
  {
    question:
      "(2) Quais discípulos perguntaram a Jesus se podiam fazer descer fogo do céu? (Lucas 9:54)",
    answers: [
      { text: "João e Tiago", correct: true },
      { text: "Pedro e João", correct: false },
      { text: "Tiago e Pedro", correct: false },
      { text: "Tiago e Mateus", correct: false },
    ],
  },
  {
    question:
      "(3) Qual era o nome da serpente de bronze que Moisés tinha feito? (2 Reis 18:4)",
    answers: [
      { text: "Aserá", correct: false },
      { text: "Leviatã", correct: false },
      { text: "Neustã", correct: true },
      { text: "Athenis", correct: false },
    ],
  },
  {
    question: "(4) Qual era o nome babilônico de Daniel? (Daniel 1:7)",
    answers: [
      { text: "Aspenaz", correct: false },
      { text: "Beltessazar", correct: true },
      { text: "Abede-Nego", correct: false },
      { text: "Mongero", correct: false },
    ],
  },
  {
    question: "(5) Qual o nome que Jacó deu ao lugar onde sonhou com Deus?",
    answers: [
      { text: "Betuel", correct: false },
      { text: "Luz", correct: false },
      { text: "Bezel", correct: false },
      { text: "Betel", correct: true },
    ],
  },
  {
    question:
      "(6) Qual o livro da Bíblia que termina com um ponto de interrogação? (Jonas 4:11)",
    answers: [
      { text: "Jonas", correct: true },
      { text: "Joel", correct: false },
      { text: "Judas", correct: false },
      { text: "João", correct: false },
    ],
  },
  {
    question: "(7) Qual livro se encontra no Novo Testamento?",
    answers: [
      { text: "Sofonias", correct: false },
      { text: "Obadias", correct: false },
      { text: "Habacuque", correct: false },
      { text: "Filemom", correct: true },
    ],
  },
  {
    question: "(8) Em quais livros da Bíblia não encontramos a palavra Deus?",
    answers: [
      { text: "Ester e Cânticos", correct: true },
      { text: "Ageu e Amós", correct: false },
      { text: "Oséias e Eclesiastes", correct: false },
      { text: "Obadias e Malaquias", correct: false },
    ],
  },
  {
    question: "(9) Qual o menor livro da Bíblia?",
    answers: [
      { text: "Judas", correct: false },
      { text: "II João", correct: true },
      { text: "III João", correct: false },
      { text: "Ester", correct: false },
    ],
  },
  {
    question:
      "(10) Na visão profética de João, qual era o número de cavaleiros do Apocalipse?",
    answers: [
      { text: "7", correct: false },
      { text: "6", correct: false },
      { text: "5", correct: false },
      { text: "4", correct: true },
    ],
  },
  {
    question: "(11) Quem escreveu a Epístola de Judas?",
    answers: [
      { text: "Judas irmão de Tiago", correct: true },
      { text: "Judas Iscariotes", correct: false },
      { text: "João Evangelista", correct: false },
      { text: "Lucas", correct: false },
    ],
  },
  {
    question:
      "(12) Quem teve seu corpo disputado pelo arcanjo Miguel e o Diabo?",
    answers: [
      { text: "Jesus", correct: false },
      { text: "Elizeu", correct: false },
      { text: "Moisés", correct: true },
      { text: "Abraão", correct: false },
    ],
  },
  {
    question:
      "(13) Qual era o nome da profetisa que estava fazendo a igreja de Tiatira cair?",
    answers: [
      { text: "Jezabel", correct: true },
      { text: "Lilith", correct: false },
      { text: "Dalila", correct: false },
      { text: "Ester", correct: false },
    ],
  },
  {
    question:
      "(14) A Morte montada em um cavalo amarelo surgiu na abertura de qual selo?",
    answers: [
      { text: "1º selo", correct: false },
      { text: "7º selo", correct: false },
      { text: "4º selo", correct: true },
      { text: "6º selo", correct: false },
    ],
  },
  {
    question:
      "(15) Quem foi a única mulher citada na Bíblia a ter status de juíza?",
    answers: [
      { text: "Jael", correct: false },
      { text: "Débora", correct: true },
      { text: "Ester", correct: false },
      { text: "Rute", correct: false },
    ],
  },
  {
    question: "(16) A quem o Apóstolo Paulo chamou de 'médico amado'?",
    answers: [
      { text: "Jesus", correct: false },
      { text: "Demas", correct: false },
      { text: "Lucas", correct: true },
      { text: "João", correct: false },
    ],
  },
  {
    question: "(17) Quem governou sendo rei e sacerdote ao mesmo tempo?",
    answers: [
      { text: "Joacaz", correct: false },
      { text: "Manassés", correct: false },
      { text: "Melquias", correct: false },
      { text: "Melquisedeque", correct: true },
    ],
  },
  {
    question: "(18) Que animal mordeu a mão do Apóstolo Paulo?",
    answers: [
      { text: "Lagarto", correct: false },
      { text: "Escorpião", correct: false },
      { text: "Víbora", correct: true },
      { text: "Abelha", correct: false },
    ],
  },
  {
    question: "(19) Qual era a idade de Calebe quando pediu Hebrom para Josué?",
    answers: [
      { text: "40 anos", correct: false },
      { text: "70 anos", correct: false },
      { text: "120 anos", correct: false },
      { text: "85 anos", correct: true },
    ],
  },
  {
    question: "(20) Por quantas moedas Judas entregou Jesus?",
    answers: [
      { text: "30 moedas de ouro", correct: false },
      { text: "30 moedas de prata", correct: true },
      { text: "100 denários", correct: false },
      { text: "30 moedas de bronze", correct: false },
    ],
  },
  {
    question:
      "(21) Quem foram apelidados por Jesus de Boanerges ('Filhos do Trovão')?",
    answers: [
      { text: "João e Pedro", correct: false },
      { text: "Lucas e Pedro", correct: false },
      { text: "Pedro e Tiago", correct: false },
      { text: "João e Tiago", correct: true },
    ],
  },
  {
    question: "(22) Qual era o nome da única filha de Lia?",
    answers: [
      { text: "Zilpa", correct: false },
      { text: "Diná", correct: true },
      { text: "Raquel", correct: false },
      { text: "Ester", correct: false },
    ],
  },
  {
    question:
      "(23) Qual o discípulo que acompanhou Jesus até a sua crucificação?",
    answers: [
      { text: "André", correct: false },
      { text: "Tiago", correct: false },
      { text: "João", correct: true },
      { text: "Pedro", correct: false },
    ],
  },
  {
    question: "(24) Quantos capítulos tem o Livro de Naum?",
    answers: [
      { text: "1", correct: false },
      { text: "4", correct: false },
      { text: "5", correct: false },
      { text: "3", correct: true },
    ],
  },
  {
    question:
      "(25) O Velho Testamento reúne mais livros do que o Novo Testamento?",
    answers: [
      { text: "sim", correct: true },
      { text: "não", correct: false },
      { text: "Ambos tem a mesma quantidade", correct: false },
    ],
  },
  {
    question:
      "(26) A estátua do sonho de Nabucodonosor era composta de quais elementos?",
    answers: [
      { text: "Toda em ouro", correct: false },
      { text: "Ouro, prata, ônix e ferro", correct: false },
      { text: "Ouro, prata, bronze, onix e ferro", correct: false },
      { text: "Ouro, prata, bronze, ferro e barro", correct: true },
    ],
  },
  {
    question: "(27) Quem era conhecido por ser cobrador de impostos?",
    answers: [
      { text: "João Batista", correct: false },
      { text: "Bartolomeu", correct: false },
      { text: "Zaqueu", correct: true },
      { text: "Judas Tadeu", correct: false },
    ],
  },
  {
    question:
      "(28) Quanto tempo Jonas ficou preso dentro da barriga de um grande peixe?",
    answers: [
      { text: "7 dias", correct: false },
      { text: "3 dias", correct: true },
      { text: "1 dia", correct: false },
      { text: "4 dias", correct: false },
    ],
  },
  {
    question:
      "(29) Quais foram os dois nomes indicados para substituir Judas Iscariotes?",
    answers: [
      { text: "Barsabás e Matias", correct: true },
      { text: "Paulo e Matias", correct: false },
      { text: "Paulo e José", correct: false },
      { text: "Matias e Paulo", correct: false },
    ],
  },
  {
    question:
      "(30) Em Tessalônica, Paulo, Silas e Timóteo se refugiaram na casa de qual irmão?",
    answers: [
      { text: "Apolo", correct: false },
      { text: "Barnabé", correct: false },
      { text: "Arquipo", correct: false },
      { text: "Jasom", correct: true },
    ],
  },
  {
    question: "(31) Adão viveu ao todo quantos anos?",
    answers: [
      { text: "930 anos", correct: true },
      { text: "1000 anos", correct: false },
      { text: "500 anos", correct: false },
      { text: "850 anos", correct: false },
    ],
  },
  {
    question:
      "(32) Jesus enviou quantos discípulos para a missão de pregar o Evangelho?",
    answers: [
      { text: "7 discípulos", correct: false },
      { text: "70 discípulos", correct: true },
      { text: "12 discípulos", correct: false },
      { text: "6 discípulos", correct: false },
    ],
  },
  {
    question:
      "(33) Em qual dia da criação foi feito o sol, a lua e as estrelas?",
    answers: [
      { text: "1º dia", correct: false },
      { text: "3º dia", correct: false },
      { text: "4º dia", correct: true },
      { text: "6º dia", correct: false },
    ],
  },
  {
    question: "(34) O Livro de Atos dos Apóstolos é conhecido como...",
    answers: [
      { text: "um livro histórico", correct: true },
      { text: "um livro profético", correct: false },
      { text: "um livro poético", correct: false },
      { text: "um livro teológico", correct: false },
    ],
  },
  {
    question: "(35) Depois do Dilúvio, Noé viveu por mais quantos anos?",
    answers: [
      { text: "350 anos", correct: true },
      { text: "100 anos", correct: false },
      { text: "200 anos", correct: false },
      { text: "50 anos", correct: false },
    ],
  },
  {
    question: "(36) Qual é o quinto livro do Novo Testamento?",
    answers: [
      { text: "Evangelho de Marcos", correct: false },
      { text: "Carta aos Romanos", correct: false },
      { text: "Atos dos Apóstolos", correct: true },
      { text: "Evangelho de Lucas", correct: false },
    ],
  },
  {
    question: "(37) Qual era o nome da mulher de Jó?",
    answers: [
      { text: "Abgail", correct: false },
      { text: "Dâmares", correct: false },
      { text: "A BÍBLIA NÃO DIZ", correct: true },
      { text: "Sophia", correct: false },
    ],
  },
  {
    question: "(38) Quem Noé amaldiçoou após saber que foi visto em nudez?",
    answers: [
      { text: "Canaã", correct: true },
      { text: "Cam", correct: false },
      { text: "Jafé", correct: false },
      { text: "Esaú", correct: false },
    ],
  },
  {
    question: "(39) Qual das alternativas não é um livro apócrifo?",
    answers: [
      { text: "Livro de Enoque", correct: false },
      { text: "Livro de Ageu", correct: true },
      { text: "Livro de Tobias", correct: false },
      { text: "Livro de Tomé", correct: false },
    ],
  },
  {
    question: "(40) Qual destes livros contém mais de um capítulo?",
    answers: [
      { text: "Judas", correct: false },
      { text: "Obadias", correct: false },
      { text: "Joel", correct: true },
    ],
  },
  {
    question: "(41) Qual é o versículo mais extenso da Bíblia?",
    answers: [
      { text: "Ester 8:9", correct: true },
      { text: "Salmos 119:43", correct: false },
      { text: "Isaías 24:2", correct: false },
      { text: "Jeremias 3:5", correct: false },
    ],
  },
  {
    question: "(42) Quantos versículos tem Salmos 119?",
    answers: [
      { text: "176 versículos", correct: true },
      { text: "200 versículos", correct: false },
      { text: "100 versículos", correct: false },
      { text: "150 versículos", correct: false },
    ],
  },
  {
    question:
      "(43) Qual a mulher que acolheu o seu inimigo e depois o matou? (Juízes 4:18-21)",
    answers: [
      { text: "Raquel", correct: false },
      { text: "Débora", correct: false },
      { text: "Jael", correct: true },
      { text: "Rebeca", correct: false },
    ],
  },
  {
    question:
      "(44) Que homem depois de morto, matou mais pessoas do que em vida? (Juízes 16:30)",
    answers: [
      { text: "Elias", correct: false },
      { text: "Sansão", correct: true },
      { text: "Judas", correct: false },
      { text: "Davi", correct: false },
    ],
  },
  {
    question:
      "(45) Quem se tornou rei enquanto procurava as jumentas do seu pai? (1 Samuel 9:3)",
    answers: [
      { text: "Davi", correct: false },
      { text: "Saul", correct: true },
      { text: "Acabe", correct: false },
      { text: "Salomão", correct: false },
    ],
  },
  {
    question:
      "(46) Quem tinha um cabelo que pesava mais de dois quilos? (2 Samuel 14:26)",
    answers: [
      { text: "Absalão", correct: true },
      { text: "Davi", correct: false },
      { text: "Sansão", correct: false },
      { text: "Eliabe", correct: false },
    ],
  },
  {
    question:
      "(47) Quem teve a vida prolongada por mais 15 anos após orar? (Isaías 38:5)",
    answers: [
      { text: "Enoque", correct: false },
      { text: "Matusalém", correct: false },
      { text: "Ezequias", correct: true },
      { text: "Elias", correct: false },
    ],
  },
  {
    question:
      "(48) Quem foi apelidado pela multidão em Listra de Zeus e Hermes? (Atos 14:12)",
    answers: [
      { text: "Pedro e João", correct: false },
      { text: "Barnabé e Paulo", correct: true },
      { text: "Jesus e Paulo", correct: false },
      { text: "João e Marcos", correct: false },
    ],
  },
  {
    question:
      "(49) Quais os 2 homens que Paulo disse que naufragaram na fé? (1 Timóteo 1:19-20)",
    answers: [
      { text: "Himeneu e Alexandre", correct: true },
      { text: "Janes e Jambres", correct: false },
      { text: "Silas e Barnabé", correct: false },
      { text: "Dimas e Tito", correct: false },
    ],
  },
  {
    question:
      "(50) Qual foi o profeta que surgiu depois de Malaquias? (Mateus 3:1)",
    answers: [
      { text: "Zacarias", correct: false },
      { text: "Joel", correct: false },
      { text: "João Batista", correct: true },
      { text: "Elias", correct: false },
    ],
  },
  {
    question: "(51) Quantos carros de ferro Jabim possuía? (Juízes 4:2)",
    answers: [
      { text: "900 carros de ferro", correct: true },
      { text: "300 carros de ferro", correct: false },
      { text: "100 carros de ferro", correct: false },
      { text: "1.000 carros de ferro", correct: false },
    ],
  },
  {
    question: "(52) Qual o nome do pai de Saul? (1 Samuel 9:1)",
    answers: [
      { text: "Abiel", correct: false },
      { text: "Quis", correct: true },
      { text: "Zeror", correct: false },
      { text: "Cis", correct: false },
    ],
  },
  {
    question: "(53) Sísera foi morto em que situação? (Juízes 4:21)",
    answers: [
      { text: "Enquanto dormia", correct: true },
      { text: "Enquanto lutava", correct: false },
      { text: "Enquanto orava", correct: false },
      { text: "Enquanto fugia", correct: false },
    ],
  },
  {
    question:
      "(54) Balaão foi chamado por quem para amaldiçoar o povo de Israel? (Números 22:4)",
    answers: [
      { text: "Moabe", correct: false },
      { text: "Balaque", correct: true },
      { text: "Zipor", correct: false },
      { text: "Zadoque", correct: false },
    ],
  },
  {
    question:
      "(55) Oséias profetizou durante o reinado de quais reis? (Oséias 1:1)",
    answers: [
      { text: "Saul, Davi e Salomão", correct: false },
      { text: "Jozias, Joacaz, Ocazias e Jorão", correct: false },
      { text: "Uzias, Jotão, Acaz, Ezequias e Jeroboão", correct: true },
      { text: "Ezequiel, Isaías, Jeremias e Daniel", correct: false },
    ],
  },
  {
    question: "(56) Oséias se casou com... (Oséias 1:2-3)",
    answers: [
      { text: "Uma rainha", correct: false },
      { text: "Uma mulher adúltera", correct: true },
      { text: "Uma mulher estrangeira", correct: false },
      { text: "Uma levita", correct: false },
    ],
  },
  {
    question: "(57) Sofonias foi profeta durante qual reinado? (Sofonias 1:1)",
    answers: [
      { text: "Reinado de Josias", correct: true },
      { text: "Reinado de Acabe", correct: false },
      { text: "Reinado de Acaz", correct: false },
      { text: "Reinado de Salomão", correct: false },
    ],
  },
  {
    question: "(58) Que povo recebeu Paulo com grande interesse? (Atos 17:11)",
    answers: [
      { text: "Os tessalônios", correct: false },
      { text: "Os bereanos", correct: true },
      { text: "Os atenienses", correct: false },
      { text: "Os coríntios", correct: false },
    ],
  },
  {
    question: "(59) O que deixou Paulo indignado em Atenas? (Atos 17:16-17)",
    answers: [
      { text: "A promiscuidade do povo grego", correct: false },
      { text: "A quantidade de ídolos na cidade", correct: true },
      { text: "A falta de sinagogas", correct: false },
      { text: "A frieza espiritual", correct: false },
    ],
  },
  {
    question:
      "(60) Em Atenas, onde Paulo foi levado para falar sobre Jesus? (Atos 17:19)",
    answers: [
      { text: "Coliseu", correct: false },
      { text: "Santuário", correct: false },
      { text: "Areópago", correct: true },
      { text: "Sinagoga", correct: false },
    ],
  },];



  activeQuestionSet = "original";

  const btnOriginal = document.getElementById("btn-original");
  const btnNew = document.getElementById("btn-new");
  const startBtn = document.getElementById("start-btn");
  const nextBtn = document.getElementById("next-btn");
  const nextPhaseBtn = document.getElementById("next-phase-btn");

  if (btnOriginal) {
    btnOriginal.addEventListener("click", () => alternarConjuntoPerguntas("original"));
  }
  if (btnNew) {
    btnNew.addEventListener("click", () => alternarConjuntoPerguntas("new"));
  }

  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      const nome = document.getElementById("usuario").value.trim();
      if (!nome) {
        alert("Digite seu nome para começar o quiz.");
        return;
      }

      localStorage.setItem("usuario", nome);
      window.horarioInicio = Date.now();
      
      nomeDoJogador = nome;
      jogadorAtivo = true;

      console.log("✅ Quiz iniciado para:", nome);

      if (window.heartbeatAPI) {
        window.heartbeatAPI.resetarTempo();
        window.heartbeatAPI.atualizarNome(nome);
      }

      await registrarJogadorInicio(nome);

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("quiz-container").classList.remove("hidden");
      startPhase(1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentIndex++;
      if (currentIndex < currentQuestions.length) {
        showQuestion();
      } else {
        showResult();
      }
    });
  }

  if (nextPhaseBtn) {
    nextPhaseBtn.addEventListener("click", () => {
      if (currentPhase < phaseLimits.length) {
        startPhase(currentPhase + 1);
      }
    });
  }
});

// Funções globais
window.salvarProgresso = function () {
  const usuario = localStorage.getItem("usuario") || "Anônimo";
  alert(`Progresso salvo localmente para ${usuario}!`);
};

window.consultarProgresso = function () {
  const usuario = localStorage.getItem("usuario") || "desconhecido";
  const backupKey = `backup_${usuario}`;
  const backups = JSON.parse(localStorage.getItem(backupKey) || "[]");
  const progressoInfo = document.getElementById("progresso-info");
  
  if (progressoInfo) {
    if (backups.length > 0) {
      const ultimo = backups[backups.length - 1];
      progressoInfo.innerHTML = `👤 ${usuario} | 📊 ${backups.length} respostas salvas | 🕓 Última: ${new Date(ultimo.timestamp).toLocaleString()}`;
    } else {
      progressoInfo.innerHTML = "⚠️ Nenhum progresso salvo";
    }
  }
};
