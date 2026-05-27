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

// 프리셋 스위칭 함수 구현 전역 개방
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

// 통신 리소스 초기 연동
const client = mqtt.connect(AI_CONFIG.mqtt_broker);
const statusDiv = document.getElementById("status");
const speechStatusDiv = document.getElementById("speechStatus");
const resultDiv = document.getElementById("result");
const aiMatchDiv = document.getElementById("ai-match");
const button = document.getElementById("voiceButton");
const topicInput = document.getElementById("topic");

// 초기 세팅 적용
topicInput.value = AI_CONFIG.default_topic;

let isListening = false;
let extractor = null;
let base_embeddings = [];

// 코사인 유사도 연산 로직
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

// AI 추론 모델 초기 로드 및 토큰 매핑
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

        // 설정 파일에서 가져온 base_commands 로 분석 모델 매핑
        base_embeddings = await Promise.all(
            AI_CONFIG.base_commands.map(cmd => extractor(cmd, { pooling: 'mean', normalize: true }))
        );

        if (loadingZone) loadingZone.style.display = 'none';
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

// 의도 분석 핸들러
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

    // 설정 파일의 임계값(threshold) 인용
    if (max_similarity > AI_CONFIG.threshold) {
        const final_command = AI_CONFIG.base_commands[best_match_index];
        const pct = Math.round(max_similarity * 100);

        aiMatchDiv.innerText = `🤖 AI 판단: "${final_command}" (${pct}% 일치)`;
        speechStatusDiv.innerText = "✓ 매칭 명령어 패킷 발행 완료";

        const topic = topicInput.value;
        client.publish(topic, final_command);
    } else {
        aiMatchDiv.innerText = "🤖 AI 판단: 의도 모호함 (명령어 전송 거부)";
        speechStatusDiv.innerText = "분석 임계값 미달로 취소됨";
    }
}

// MQTT 이벤트 감시 브릿지
client.on("connect", () => {
    statusDiv.innerText = "● NETWORK CONNECTED";
    statusDiv.style.borderColor = "#22c55e"; statusDiv.style.color = "#22c55e";
});
client.on("error", () => {
    statusDiv.innerText = "● CONNECTION FAILED";
    statusDiv.style.borderColor = "#ef4444"; statusDiv.style.color = "#ef4444";
});

// 오디오 리코드 인터페이스 탑재
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;

    window.startRecognition = function() {
        if(isListening) { recognition.stop(); return; }
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
        for(let i = 0; i < event.results.length; i++) { realtimeText += event.results[i][0].transcript; }
        resultDiv.innerText = realtimeText;

        const lastResult = event.results[event.results.length - 1];
        if(lastResult.isFinal) { analyzeSpeechIntent(lastResult[0].transcript); }
    };

    recognition.onend = () => {
        isListening = false;
        button.classList.remove("listening");
        setTimeout(() => {
            if(!isListening && speechStatusDiv.innerText !== "✓ 매칭 명령어 패킷 발행 완료"){
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

// 초기 로딩 트리거 가동
initAI();
window.changePresetEngine();