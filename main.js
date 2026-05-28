import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';
import { AI_CONFIG } from './ai-config.js';

env.allowLocalModels = false;

// ==========================================
// 1. 테마별 프리셋 UI 데이터 세팅
// ==========================================
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
    //    document.getElementById("topicBox").style.color = config.text;
    const topicBox = document.getElementById("topicBox");
    if (topicBox) {
        topicBox.style.borderColor = (selected === "assistant" || selected === "guide") ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)";
    }
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

// ==========================================
// 2. 통신 브로커 및 기본 화면 엘레먼트 연결
// ==========================================
const client = mqtt.connect(AI_CONFIG.mqtt_broker);
const statusDiv = document.getElementById("status");
const speechStatusDiv = document.getElementById("speechStatus");
const resultDiv = document.getElementById("result");
const aiMatchDiv = document.getElementById("ai-match");
const button = document.getElementById("voiceButton");
const topicInput = document.getElementById("topic");

// 민감도 슬라이더 및 아코디언 관련 엘레먼트 바인딩 (여기에 딱 한 번만 정의!)
const thresholdSlider = document.getElementById("threshold-slider");
const thresholdValDisplay = document.getElementById("threshold-val");
const thresholdDesc = document.getElementById("threshold-desc");
const accordionBtn = document.getElementById("accordion-toggle-btn");
const accordionBottomCloseBtn = document.getElementById("accordion-bottom-close-btn");
const accordionContent = document.getElementById("accordion-content");
const accordionArrow = document.getElementById("accordion-arrow");
const commandTagsContainer = document.getElementById("command-tags-container");
const newCommandInput = document.getElementById("new-command-input");

// 런타임 제어용 전역 변수
let currentThreshold = AI_CONFIG.threshold;
let liveCommands = [...AI_CONFIG.base_commands];
let extractor = null;
let base_embeddings = [];
let isListening = false;

// 초기 설정 동기화
if (topicInput) {
    topicInput.value = AI_CONFIG.default_topic;
}

const subTopicInput = document.getElementById('subTopic');
let currentSubTopic = subTopicInput ? subTopicInput.value : AI_CONFIG.default_sub_topic;
// 3. 💡 [새로 추가] 화면이 처음 켜질 때 수신 인풋창에 기본값 주입
if (subTopicInput) {
    subTopicInput.value = AI_CONFIG.default_sub_topic;
}
// ==========================================
// 3. 민감도 슬라이더 상태 조작 엔진
// ==========================================
function updateSliderUI(value) {
    if(!thresholdValDisplay || !thresholdSlider || !thresholdDesc) return;
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

if(thresholdSlider) {
    thresholdSlider.oninput = function() {
        currentThreshold = parseFloat(this.value);
        updateSliderUI(currentThreshold);
    };
}

// ==========================================
// 4. AI 명령어 배지 그리기 / 추가 / 제거 로직
// ==========================================
function renderCommandTags() {
    if (!commandTagsContainer) return;
    commandTagsContainer.innerHTML = "";

    liveCommands.forEach((cmd, index) => {
        const isSystemCommand = AI_CONFIG.base_commands.includes(cmd);
        const tag = document.createElement("span");

        if (isSystemCommand) {
            tag.style.cssText = `
                font-size: 0.75rem; font-weight: bold; padding: 4px 10px;
                background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px; color: #94a3b8; display: inline-flex; align-items: center; gap: 6px;
            `;
            const textSpan = document.createElement("span");
            textSpan.innerText = `🔒 ${cmd}`;
            tag.appendChild(textSpan);
        } else {
            tag.style.cssText = `
                font-size: 0.75rem; font-weight: bold; padding: 4px 10px;
                background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.6);
                border-radius: 6px; color: #38bdf8; display: inline-flex; align-items: center; gap: 6px;
                box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
            `;
            const textSpan = document.createElement("span");
            textSpan.innerText = `• ${cmd}`;
            tag.appendChild(textSpan);

            const closeBtn = document.createElement("span");
            closeBtn.innerText = "×";
            closeBtn.style.cssText = `cursor: pointer; color: #f87171; font-size: 0.9rem; font-weight: 900; padding: 0 2px; transition: color 0.2s;`;
            closeBtn.onmouseover = () => closeBtn.style.color = "#ef4444";
            closeBtn.onmouseout = () => closeBtn.style.color = "#f87171";
            closeBtn.onclick = () => window.removeAIVocabulary(index, cmd);
            tag.appendChild(closeBtn);
        }
        commandTagsContainer.appendChild(tag);
    });
}

window.addNewAIVocabulary = async function() {
    // const newCmd = newCommandInput.value.trim();
    // if (!newCmd) { alert("추가할 명령어 단어를 입력해 주세요!"); return; }

    // if (liveCommands.includes(newCmd)) { alert("이미 인공지능이 학습한 명령어입니다."); return; }

    // speechStatusDiv.innerText = `🧠 AI에게 "${newCmd}" 단어를 훈련하는 중...`;
    // button.disabled = true;


    let newCmd = newCommandInput.value.trim();
    if (!newCmd) { alert("추가할 명령어 단어를 입력해 주세요!"); return; }

    // 🌟 [새로 추가] 한글, 영문, 숫자, 공백을 제외한 모든 문장부호(?, !, ., ~ 등)를 원천 제거!
    newCmd = newCmd.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣\s]/g, "");

    // 🌟 [새로 추가] 기호를 빼버렸더니 아무 글자도 안 남은 빈털터리일 때 예외 처리
    if (!newCmd.trim()) {
        alert("물음표(?)나 기호 외에 진짜 한글 단어를 입력해 주세요!");
        newCommandInput.value = "";
        return;
    }

    if (liveCommands.includes(newCmd)) { alert("이미 인공지능이 학습한 명령어입니다."); return; }

    speechStatusDiv.innerText = `🧠 AI에게 "${newCmd}" 단어를 훈련하는 중...`;
    button.disabled = true;

    try {
        liveCommands.push(newCmd);
        renderCommandTags();

        const newEmbedding = await extractor(newCmd, { pooling: 'mean', normalize: true });
        base_embeddings.push(newEmbedding);

        newCommandInput.value = "";
        speechStatusDiv.innerText = `✓ "${newCmd}" 단어 훈련 완수! 즉시 사용 가능`;
        window.resizeAccordionIfOpen();
    } catch (e) {
        speechStatusDiv.innerText = "단어 학습 실패: " + e.message;
        console.error(e);
    } finally {
        button.disabled = false;
    }
};

window.removeAIVocabulary = function(index, cmd) {
    if (AI_CONFIG.base_commands.includes(cmd)) return;
    if (!confirm(`🤖 AI에게 학습시킨 "${cmd}" 명령어를 삭제(망각)하시겠습니까?`)) return;

    try {
        button.disabled = true;
        liveCommands.splice(index, 1);
        base_embeddings.splice(index, 1);
        renderCommandTags();
        speechStatusDiv.innerText = `✓ "${cmd}" 단어를 기억에서 완전히 삭제했습니다.`;
        window.resizeAccordionIfOpen();
    } catch (e) {
        speechStatusDiv.innerText = "단어 삭제 실패: " + e.message;
        console.error(e);
    } finally {
        button.disabled = false;
    }
};

// ==========================================
// 5. 아코디언 접기/펼치기 및 사파리 튜닝 스크립트
// ==========================================
if (commandTagsContainer) {
    const style = document.createElement('style');
    style.innerHTML = `
        #command-tags-container::-webkit-scrollbar { width: 6px !important; display: block !important; }
        #command-tags-container::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05) !important; border-radius: 4px !important; }
        #command-tags-container::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.4) !important; border-radius: 4px !important; }
    `;
    document.head.appendChild(style);
}

function handleAccordionToggle(forceClose = false) {
    if (!accordionContent) return;
    const currentMaxHeight = accordionContent.style.maxHeight;

    if (forceClose || (currentMaxHeight && currentMaxHeight !== "0px")) {
        accordionContent.style.maxHeight = "0px";
        if (accordionArrow) { accordionArrow.style.transform = "rotate(0deg)"; accordionArrow.style.color = "#38bdf8"; }
    } else {
        accordionContent.style.maxHeight = "none";
        const targetHeight = accordionContent.scrollHeight;
        accordionContent.style.maxHeight = "0px";
        setTimeout(() => {
            accordionContent.style.maxHeight = targetHeight + "px";
            if (accordionArrow) { accordionArrow.style.transform = "rotate(180deg)"; accordionArrow.style.color = "#ef4444"; }
        }, 10);
    }
}

if (accordionBtn) { accordionBtn.addEventListener("click", (e) => { e.preventDefault(); handleAccordionToggle(false); }); }
if (accordionBottomCloseBtn) { accordionBottomCloseBtn.addEventListener("click", (e) => { e.preventDefault(); handleAccordionToggle(true); }); }

window.resizeAccordionIfOpen = function() {
    if (accordionContent && accordionContent.style.maxHeight && accordionContent.style.maxHeight !== "0px") {
        accordionContent.style.maxHeight = "none";
        const newHeight = accordionContent.scrollHeight;
        accordionContent.style.maxHeight = newHeight + "px";
        setTimeout(() => { if (commandTagsContainer) commandTagsContainer.scrollTop = commandTagsContainer.scrollHeight; }, 50);
    }
};

// ==========================================
// 6. 수학적 AI 코사인 유사도 분석 핵심 모듈
// ==========================================
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

async function initAI() {
    const progressBar = document.getElementById('loading-bar');
    const progressPct = document.getElementById('loading-pct');
    const loadingZone = document.getElementById('loadingZone');

    try {
        extractor = await pipeline('feature-extraction', AI_CONFIG.model_name, {
            progress_callback: (data) => {
                if (data.status === 'progress' && progressBar && progressPct) {
                    const progressValue = Math.round(data.progress);
                    progressBar.value = progressValue;
                    progressPct.innerText = `${progressValue}%`;
                }
            }
        });

        if (document.getElementById('loading-msg')) { document.getElementById('loading-msg').innerText = "🤖 명령어 벡터 공간 변환 매핑 중..."; }


        // 🌟 [수정] 기본 명령어 배열을 컴파일할 때도 특수문자를 자동으로 제거하고 AI에게 전달합니다.
        base_embeddings = await Promise.all(
            liveCommands.map(cmd => {
                // 1. 혹시 모를 특수문자 노이즈 제거
                const cleanCmd = cmd.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣\s]/g, "");
                // 2. 괄호 오류를 해결하고 올바르게 extractor 결과 반환 (return)
                return extractor(cleanCmd, { pooling: 'mean', normalize: true });
            })
        );

        if (loadingZone) loadingZone.style.display = 'none';
        renderCommandTags();
        button.disabled = false;

        const selected = document.getElementById("uiPreset").value;
        button.style.background = appPresets[selected].btnBg;
// 🌟 [새로 추가] 앱이 처음 구동 완료되었을 때 수신창 초기 상태 주소 매핑 완료 시각화
        const resBox = document.getElementById('robot-response');
        if (resBox) {
            resBox.innerText = `📡 ${AI_CONFIG.default_sub_topic} : 연결 스탠바이`;
            // 2. 🔥 [중요] 자바스크립트 내부 변수도 설정 파일 기본값으로 완벽하게 일치시킵니다.
            currentSubTopic = AI_CONFIG.default_sub_topic;
        }
        speechStatusDiv.innerText = "주행 대시보드 스탠바이 완료";
    } catch (e) {
        if (document.getElementById('loading-msg')) { document.getElementById('loading-msg').innerText = "AI 컴파일 실패: " + e.message; }
        console.error(e);
    }
}

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

    if (max_similarity > currentThreshold) {
        const final_command = liveCommands[best_match_index];
        const pct = Math.round(max_similarity * 100);
        aiMatchDiv.innerText = `🤖 AI 판단: "${final_command}" (${pct}% 일치)`;
        speechStatusDiv.innerText = "✓ 명령 전송 완료";
        client.publish(topicInput.value, final_command);
    } else {
        const pct = Math.round(max_similarity * 100);
        const final_command = liveCommands[best_match_index];
        aiMatchDiv.innerText = `❌ 전송 거부 (최고 일치: "${final_command}" ${pct}%)`;
        speechStatusDiv.innerText = "설정된 기준 점수 미달로 취소됨";
    }
}

// ==========================================
// 6. 수신(RX) 채널 실시간 가변 제어 엔진
// ==========================================
function remapMqttSubscription() {
    if (!subTopicInput || !client || !client.connected) return;
    const newSubTopic = subTopicInput.value.trim();

    if (!newSubTopic) {
        alert("수신(RX) 토픽 채널 주소를 입력해 주세요!");
        subTopicInput.value = currentSubTopic;
        return;
    }

    if (newSubTopic !== currentSubTopic) {
        client.unsubscribe(currentSubTopic, () => {
            console.log(`기존 RX 채널 해제 완료: ${currentSubTopic}`);
        });

        client.subscribe(newSubTopic, (err) => {
            if (!err) {
                console.log(`새로운 RX 채널 실시간 구독 완수: ${newSubTopic}`);
                speechStatusDiv.innerText = `📡 수신 채널이 [${newSubTopic}](으)로 변경됨`;

                // 💡 [여기가 수정 핵심!] 내부 변수를 갱신한 직후, 하단 전광판의 이름표도 실시간으로 즉시 동기화해 줍니다.
                currentSubTopic = newSubTopic;

                const resBox = document.getElementById('robot-response');
                if (resBox) {
                    // 🎯 사용자가 수정한 새 주소 이름표를 달고 "대기 중..." 상태로 변환!
                    resBox.innerText = `📡 ${currentSubTopic} : 대기 중...`;
                }

                setTimeout(() => { speechStatusDiv.innerText = "대시보드 링크 스탠바이"; }, 1500);
            } else {
                speechStatusDiv.innerText = "❌ 채널 변경 실패";
            }
        });
    }
}

// 사용자가 입력창 수정을 끝내고 다른 곳을 터치했을 때(blur) 채널 변경 발동
if (subTopicInput) {
    subTopicInput.addEventListener('blur', remapMqttSubscription);

    // 입력창에서 키보드 [엔터] 키를 눌렀을 때도 즉시 채널이 바뀌도록 UX 편의성 추가
    subTopicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            subTopicInput.blur(); // 포커스를 아웃시켜 위의 blur 이벤트를 트리거함
        }
    });
}



// ==========================================
// 7. 스마트폰 마이크 음성인식 인터페이스 브릿지
// ==========================================
client.on("connect", () => { statusDiv.innerText = "● NETWORK CONNECTED"; statusDiv.style.borderColor = "#22c55e"; statusDiv.style.color = "#22c55e"; });
client.on("error", () => { statusDiv.innerText = "● CONNECTION FAILED"; statusDiv.style.borderColor = "#ef4444"; statusDiv.style.color = "#ef4444"; });

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
    recognition.lang = "ko-KR"; recognition.interimResults = true; recognition.continuous = false;

window.startRecognition = function() {
        if(isListening){ recognition.stop(); return; }
        isListening = true;
        button.classList.add("listening");
        speechStatusDiv.innerText = "🎙️ 실시간 보이스 트래킹 중...";

        // 🌟 [수정] 마이크를 누를 때도 그냥 대기가 아니라 현재 채널명의 대기 상태임을 명시
        const resBox = document.getElementById('robot-response');
        if (resBox) {
            resBox.innerText = `📡 ${currentSubTopic} : 대기 중...`;
        }

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
        isListening = false; button.classList.remove("listening");
        setTimeout(() => {
            if(!isListening && !speechStatusDiv.innerText.includes("발행 완료") && !speechStatusDiv.innerText.includes("취소됨")){
                speechStatusDiv.innerText = "대시보드 링크 스탠바이";
                const selected = document.getElementById("uiPreset").value;
                if(resultDiv.innerText.trim() === "" || resultDiv.innerText === currentPlaceholder) {
                    resultDiv.innerText = currentPlaceholder; resultDiv.style.color = appPresets[selected].sub; resultDiv.removeAttribute('data-has-text');
                }
            }
        }, 2000);
    };

    recognition.onerror = (event) => { speechStatusDiv.innerText = "FAIL: " + event.error; isListening = false; button.classList.remove("listening"); };
}


// client 연결 설정 내부 (기존 로직에 추가)
client.on('connect', () => {
    document.getElementById('status').innerText = "🟢 관제 시스템 연결 완료";
    document.getElementById('status').style.background = "rgba(34, 197, 94, 0.2)";
    document.getElementById('status').style.borderColor = "#22c55e";

    // 🌟 [신규] 연결되자마자 HTML에 적혀있는 RX(수신) 토픽을 자동으로 구독(Subscribe)합니다.
    const rxTopic = document.getElementById('subTopic').value;
    client.subscribe(rxTopic, (err) => {
        if (!err) {
            console.log(`구독 성공: ${rxTopic}`);
        }
    });
});
// 🌟 [신규] 브로커를 통해 로봇(Zumi)이 보내온 메시지를 수신했을 때 실행되는 핸들러
// 🌟 [수정] 고정된 "로봇:" 문구를 걷어내고 실시간 수신 채널명(currentSubTopic)을 동적으로 출력!
client.on('message', (topic, message) => {
    const receivedMsg = message.toString();
    if (topic === currentSubTopic) {
        const resBox = document.getElementById('robot-response');
        if (resBox) {
            // 🎯 예: "student01/res : 안녕하세요" 형태로 동적 조립
            resBox.innerText = `📩 ${currentSubTopic} : "${receivedMsg}"`;
            resBox.style.transform = "scale(1.05)";
            setTimeout(() => { resBox.style.transform = "scale(1.0)"; }, 200);
        }
        // 2. [선택 사항] 로봇의 응답을 스마트폰 스피커(TTS)로 직접 읽어주고 싶다면 활성화!
        /*
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(receivedMsg);
            utterance.lang = 'ko-KR';
            utterance.rate = 1.1; // 약간 빠르게 설정
            window.speechSynthesis.speak(utterance);
        }
        */
    }
});


// 최초 가동 엔트리 트리거
thresholdSlider.value = currentThreshold;
updateSliderUI(currentThreshold);
initAI();
window.changePresetEngine();