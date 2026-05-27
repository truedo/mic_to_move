import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';
import { AI_CONFIG } from './ai-config.js';

env.allowLocalModels = false;

// 테마별 프리셋 UI 데이터 세팅
const appPresets = {
    smartcar: { themeClass: "screen-smartcar", btnBg: "#00e5ff", text: "#ffffff", sub: "#7084b0", dMeta: "Autopilot 관제 시스템", dValue: "HUD 크루즈 모드 대기", dBadge: "🏎️", placeholder: "📍 자율주행 주행 제어\n\"앞으로 조금 가볼래?\", \"우회전\"\nZumi 조종 음성을 자유롭게 말해보세요." },
    taxi: { themeClass: "screen-taxi", btnBg: "#f59e0b", text: "#ffffff", sub: "#9ca3af", dMeta: "실시간 미터기 정보", dValue: "영업 상태: 대기 중", dBadge: "🚕", placeholder: "🚖 AI 호출 택시 플랫폼\n\"오른쪽으로 차선 변경해줘\"\n목적지 방향 지시를 내리세요." },
    assistant: { themeClass: "screen-assistant", btnBg: "#6366f1", text: "#1f2937", sub: "#6b7280", dMeta: "AI 스마트 싱크 링크", dValue: "개인 로봇 비서 활성화", dBadge: "🔮", placeholder: "🤖 로봇 비서 커넥트\n\"거기서 잠깐만 멈춰줄래?\"\n수행할 비서 업무를 지시하세요." },
    delivery: { themeClass: "screen-delivery", btnBg: "#f97316", text: "#f8fafc", sub: "#94a3b8", dMeta: "AGV 적재 물류 현황", dValue: "배터리 100% [도어 잠김]", dBadge: "📦", placeholder: "🏭 자율 물류 로봇 시스템\n\"후진해서 자재창고로 가\"\n물류 이동 명령을 내려주세요." },
    guide: { themeClass: "screen-guide", btnBg: "#0ea5e9", text: "#18181b", sub: "#71717a", dMeta: "인포 무인 키오스크", dValue: "안내 스크린 정상 작동", dBadge: "🏢", placeholder: "💁 빌딩 인포메이션 로봇\n\"우측 통로로 이동해봐\"\n원하는 이동 방향을 편하게 요청하세요." },
    mars: { themeClass: "screen-mars", btnBg: "#eab308", text: "#fef3c7", sub: "#b45309", dMeta: "Deep Space 원격 터미널", dValue: "위성 신호 양호 (PING 1.2s)", dBadge: "🛰️", placeholder: "🚀 행성 탐사선 로버 조종\n\"정면 전방으로 전진 기어\"\nNASA 우주 통제부 조종 신호를 보냅니다." }
};

let currentPlaceholder = appPresets.smartcar.placeholder;

window.changePresetEngine = function() {
    const selected = document.getElementById("uiPreset").value;
    const config = appPresets[selected];

    document.querySelectorAll('.theme-screen').forEach(scr => scr.classList.remove('active'));
    document.getElementById(`screen-${selected}`).classList.add('active');

    document.body.style.color = config.text;
    document.getElementById("speechStatus").style.color = config.sub;
    document.getElementById("status").style.color = config.text;
    document.getElementById("topicBox").style.color = config.text;

    document.getElementById("dashMetaLabel").innerText = config.dMeta;
    document.getElementById("dashMainValue").innerText = config.dValue;
    document.getElementById("dashStatusBadge").innerText = config.dBadge;

    const dash = document.getElementById("appDashboard");
    dash.style.background = (selected === "assistant" || selected === "guide") ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
    dash.style.borderColor = (selected === "assistant" || selected === "guide") ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";

    const micBtn = document.getElementById("voiceButton");
    if(!micBtn.disabled) micBtn.style.background = config.btnBg;

    currentPlaceholder = config.placeholder;
    const resultDiv = document.getElementById("result");
    if(resultDiv.getAttribute('data-has-text') !== 'true') {
        resultDiv.innerText = currentPlaceholder;
        resultDiv.style.color = config.sub;
    }
};

// 통신 및 화면 엘레먼트 리소스 연동
const client = mqtt.connect(AI_CONFIG.mqtt_broker);
const statusDiv = document.getElementById("status");
const speechStatusDiv = document.getElementById("speechStatus");
const resultDiv = document.getElementById("result");
const aiMatchDiv = document.getElementById("ai-match");
const button = document.getElementById("voiceButton");
const topicInput = document.getElementById("topic");

// 슬라이더 및 명령어 추가 UI 바인딩
const thresholdSlider = document.getElementById("threshold-slider");
const thresholdValDisplay = document.getElementById("threshold-val");
const thresholdDesc = document.getElementById("threshold-desc");
const commandTagsContainer = document.getElementById("command-tags-container");
const newCommandInput = document.getElementById("new-command-input");

// 실시간 변형을 위한 동적 로컬 변수화
let currentThreshold = AI_CONFIG.threshold;
let liveCommands = [...AI_CONFIG.base_commands]; // 실시간 명령어 리스트
let extractor = null;
let base_embeddings = [];
let isListening = false;

// 초기 UI 상태 세팅 동기화
topicInput.value = AI_CONFIG.default_topic;

// 슬라이더 상태 및 설명 메시지 동적 업데이트 함수
function updateSliderUI(value) {
    thresholdValDisplay.innerText = value.toFixed(2);
    if (value <= 0.35) {
        thresholdSlider.style.accentColor = "#22c55e";
        thresholdValDisplay.style.color = "#22c55e";
        thresholdDesc.style.color = "#4ade80";
        thresholdDesc.innerText = "📢 대충 알아듣기 모드\n(아무 말이나 잘 반응하지만, 소음에도 로봇이 오작동할 수 있어요!)";
    } else if (value >= 0.70) {
        thresholdSlider.style.accentColor = "#ef4444";
        thresholdValDisplay.style.color = "#ef4444";
        thresholdDesc.style.color = "#f87171";
        thresholdDesc.innerText = "🔒 칼같이 검사 모드\n(기준 명령어 단어와 거의 똑같이 말해야만 움직여요! 발음 주의)";
    } else {
        thresholdSlider.style.accentColor = "#38bdf8";
        thresholdValDisplay.style.color = "#38bdf8";
        thresholdDesc.style.color = "#7dd3fc";
        thresholdDesc.innerText = "✨ 추천 인식 모드\n(자연스러운 대화 맥락과 정확한 명령어 사이에서 균형 있게 판정해요.)";
    }
}

// 화면에 실시간 명령어 배지 태그를 그려주는 함수
// 💡 [수정] 화면에 명령어 배지 태그를 그려주는 함수 (엑스 버튼 및 삭제 기능 추가)
// 💡 [업그레이드] 기본 명령어와 추가 명령어를 색상과 버튼으로 완벽히 분리하는 함수
function renderCommandTags() {
    if (!commandTagsContainer) return;
    commandTagsContainer.innerHTML = "";

    liveCommands.forEach((cmd, index) => {
        // 시스템 기본 명령어인지 판별 (true / false)
        const isSystemCommand = AI_CONFIG.base_commands.includes(cmd);

        // 태그 전체를 감싸는 상자 생성
        const tag = document.createElement("span");

        if (isSystemCommand) {
            // 🔒 1. 시스템 기본 명령어 디자인 (차분한 슬레이트 그레이/네이비 톤)
            tag.style.cssText = `
                font-size: 0.75rem; font-weight: bold; padding: 4px 10px;
                background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px; color: #94a3b8; display: inline-flex; align-items: center; gap: 6px;
            `;

            // 글자 영역만 생성 후 삽입 (X 버튼 없음)
            const textSpan = document.createElement("span");
            textSpan.innerText = `🔒 ${cmd}`; // 자물쇠 아이콘으로 시각적 보호 표시
            tag.appendChild(textSpan);

        } else {
            // 🟢 2. 사용자가 추가한 커스텀 훈련 단어 디자인 (화사한 네온 스카이블루 톤)
            tag.style.cssText = `
                font-size: 0.75rem; font-weight: bold; padding: 4px 10px;
                background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.6);
                border-radius: 6px; color: #38bdf8; display: inline-flex; align-items: center; gap: 6px;
                box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
            `;

            // 글자 영역
            const textSpan = document.createElement("span");
            textSpan.innerText = `• ${cmd}`;
            tag.appendChild(textSpan);

            // 삭제 가능한 단어에만 활성화되는 엑스(×) 버튼
            const closeBtn = document.createElement("span");
            closeBtn.innerText = "×";
            closeBtn.style.cssText = `
                cursor: pointer; color: #f87171; font-size: 0.9rem; font-weight: 900;
                padding: 0 2px; transition: color 0.2s;
            `;
            closeBtn.onmouseover = () => closeBtn.style.color = "#ef4444";
            closeBtn.onmouseout = () => closeBtn.style.color = "#f87171";

            // 클릭 시 삭제 전역 함수 호출
            closeBtn.onclick = () => window.removeAIVocabulary(index, cmd);
            tag.appendChild(closeBtn);
        }

        commandTagsContainer.appendChild(tag);
    });
}

// 💡 [새로 추가] 학생들이 태그의 X를 눌렀을 때 발동하는 인공지능 단어 망각(삭제) 함수
window.removeAIVocabulary = function(index, cmd) {
    // ai-config.js에 적어둔 가장 기본적인 필수 5대 명령어는 실수로 지우지 못하게 안전장치를 겁니다.
    if (AI_CONFIG.base_commands.includes(cmd)) {
        alert(`"${cmd}"는 시스템 기본 명령어이므로 삭제할 수 없습니다!`);
        return;
    }

    if (!confirm(`🤖 AI에게 학습시킨 "${cmd}" 명령어를 삭제(망각)하시겠습니까?`)) return;

    try {
        button.disabled = true; // 연산 싱크를 위해 잠시 마이크 차단

        // 1. 라이브 단어 배열에서 해당 순서의 데이터 1개 삭제
        liveCommands.splice(index, 1);

        // 2. 중요: 수학적 인공지능 벡터 저장소(base_embeddings)에서도 똑같은 순서의 벡터를 삭제합니다.
        base_embeddings.splice(index, 1);

        // 3. UI 리렌더링
        renderCommandTags();
        speechStatusDiv.innerText = `✓ "${cmd}" 단어를 기억에서 완전히 삭제했습니다.`;
    } catch (e) {
        speechStatusDiv.innerText = "단어 삭제 실패: " + e.message;
        console.error(e);
    } finally {
        button.disabled = false;
    }
};

// 슬라이더 조작 실시간 이벤트 리스너 정의
thresholdSlider.oninput = function() {
    currentThreshold = parseFloat(this.value);
    updateSliderUI(currentThreshold);
};

// 💡 [기존 유지] 학생들이 화면에서 새 명령어를 주입할 때 발동하는 함수
window.addNewAIVocabulary = async function() {
    const newCmd = newCommandInput.value.trim();

    if (!newCmd) {
        alert("추가할 명령어 단어를 입력해 주세요!");
        return;
    }
    if (liveCommands.includes(newCmd)) {
        alert("이미 인공지능이 학습한 명령어입니다.");
        return;
    }

    speechStatusDiv.innerText = `🧠 AI에게 "${newCmd}" 단어를 훈련하는 중...`;
    button.disabled = true;

    try {
        liveCommands.push(newCmd);
        renderCommandTags();

        const newEmbedding = await extractor(newCmd, { pooling: 'mean', normalize: true });
        base_embeddings.push(newEmbedding);

        newCommandInput.value = "";
        speechStatusDiv.innerText = `✓ "${newCmd}" 단어 훈련 완수! 즉시 사용 가능`;
    } catch (e) {
        speechStatusDiv.innerText = "단어 학습 실패: " + e.message;
        console.error(e);
    } finally {
        button.disabled = false;
    }
};

// 코사인 유사도 벡터 계산 엔진
function calculateCosineSimilarity(query, base) {
    let dotProduct = 0.0; let normA = 0.0; let normB = 0.0;
    for (let i = 0; i < query.length; i++) {
        dotProduct += query[i] * base[i];
        normA += query[i] * query[i];
        normB += base[i] * base[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// AI 추론 모델 초기 구축
async function initAI() {
    const progressBar = document.getElementById('loading-bar');
    const progressPct = document.getElementById('loading-pct');
    const loadingZone = document.getElementById('loadingZone');

    try {
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            progress_callback: (data) => {
                if (data.status === 'progress' && progressBar && progressPct) {
                    const progressValue = Math.round(data.progress);
                    progressBar.value = progressValue;
                    progressPct.innerText = `${progressValue}%`;
                }
            }
        });

        if (document.getElementById('loading-msg')) {
            document.getElementById('loading-msg').innerText = "🤖 명령어 벡터 공간 변환 매핑 중...";
        }

        // 실시간 연동 리스트(liveCommands) 기반으로 AI 벡터화 맵 최초 빌딩
        base_embeddings = await Promise.all(
            liveCommands.map(cmd => extractor(cmd, { pooling: 'mean', normalize: true }))
        );

        // 로딩 완료 후 인터페이스 개방 및 배지 그리기
        if (loadingZone) loadingZone.style.display = 'none';
        renderCommandTags();
        button.disabled = false;

        const selected = document.getElementById("uiPreset").value;
        button.style.background = appPresets[selected].btnBg;
        speechStatusDiv.innerText = "주행 대시보드 스탠바이 완료";
    } catch (e) {
        if (document.getElementById('loading-msg')) {
            document.getElementById('loading-msg').innerText = "AI 컴파일 실패: " + e.message;
        }
        console.error(e);
    }
}

// 시맨틱 의미 매칭 핸들러
async function analyzeSpeechIntent(student_speech) {
    speechStatusDiv.innerText = "🤖 온디바이스 NLP 분석 구동 중...";
    const speech_embedding = await extractor(student_speech, { pooling: 'mean', normalize: true });

    let max_similarity = -1; let best_match_index = 0;

    for (let i = 0; i < base_embeddings.length; i++) {
        const similarity = calculateCosineSimilarity(speech_embedding.data, base_embeddings[i].data);
        if (similarity > max_similarity) {
            max_similarity = similarity;
            best_match_index = i;
        }
    }

    // 실시간 슬라이더 변수(currentThreshold) 및 가변 명령어 목록(liveCommands) 인용
    if (max_similarity > currentThreshold) {
        const final_command = liveCommands[best_match_index];
        const pct = Math.round(max_similarity * 100);

        aiMatchDiv.innerText = `🤖 AI 판단: "${final_command}" (${pct}% 일치)`;
        speechStatusDiv.innerText = "✓ 매칭 명령어 패킷 발행 완료";

        const topic = topicInput.value;
        client.publish(topic, final_command);
    } else {
        const pct = Math.round(max_similarity * 100);
        const final_command = liveCommands[best_match_index];
        aiMatchDiv.innerText = `❌ 전송 거부 (최고 일치: "${final_command}" ${pct}%)`;
        speechStatusDiv.innerText = "설정된 기준 점수 미달로 취소됨";
    }
}

// MQTT 네트워크 이벤트 리스너
client.on("connect", () => {
    statusDiv.innerText = "● NETWORK CONNECTED";
    statusDiv.style.borderColor = "#22c55e"; statusDiv.style.color = "#22c55e";
});
client.on("error", () => {
    statusDiv.innerText = "● CONNECTION FAILED";
    statusDiv.style.borderColor = "#ef4444"; statusDiv.style.color = "#ef4444";
});

// 음성 캡처 인터페이스
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;

    window.startRecognition = function() {
        if(isListening){ recognition.stop(); return; }
        isListening = true;
        button.classList.add("listening");
        speechStatusDiv.innerText = "🎙️ 실시간 보이스 트래킹 중...";

        resultDiv.innerText = ""; aiMatchDiv.innerText = "";
        resultDiv.style.color = "inherit"; resultDiv.setAttribute('data-has-text', 'true');
        recognition.start();
    };

    button.onclick = window.startRecognition;

    recognition.onresult = (event) => {
        let realtimeText = "";
        for(let i = 0; i < event.results.length; i++){ realtimeText += event.results[i][0].transcript; }
        resultDiv.innerText = realtimeText;

        const lastResult = event.results[event.results.length - 1];
        if(lastResult.isFinal){ analyzeSpeechIntent(lastResult[0].transcript); }
    };

    recognition.onend = () => {
        isListening = false;
        button.classList.remove("listening");
        setTimeout(() => {
            if(!isListening && !speechStatusDiv.innerText.includes("발행 완료") && !speechStatusDiv.innerText.includes("취소됨")){
                speechStatusDiv.innerText = "대시보드 링크 스탠바이";
                const selected = document.getElementById("uiPreset").value;
                if(resultDiv.innerText.trim() === "" || resultDiv.innerText === currentPlaceholder) {
                    resultDiv.innerText = currentPlaceholder;
                    resultDiv.style.color = appPresets[selected].sub;
                    resultDiv.removeAttribute('data-has-text');
                }
            }
        }, 2000);
    };

    recognition.onerror = (event) => {
        speechStatusDiv.innerText = "FAIL: " + event.error;
        isListening = false; button.classList.remove("listening");
    };
}

// 최초 런타임 엔트리 트리거 실행
thresholdSlider.value = currentThreshold;
updateSliderUI(currentThreshold);
initAI();
window.changePresetEngine();