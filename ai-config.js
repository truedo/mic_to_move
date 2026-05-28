/**
 * Zumi 임베디드 AI 음성인식 파라미터 구성 파일
 */

export const AI_CONFIG = {
  // model_name: " Xenova/all-MiniLM-L6-v2" // 23 MB (초고속 로딩) 성능 낮음
    model_name: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", // 110 MB (준수한 로딩) 성능 보통

    //  1. 인공지능이 매칭할 표준 로봇 명령어 리스트
    base_commands: [
        "앞으로 가라",
        "뒤로 가라",
        "오른쪽으로 돌아",
        "왼쪽으로 돌아",
        "멈춰",
        "집으로 가",
        "학교로 이동",
        "충전소로 가줘",
        "목적지까지 안내해",
        "배달 시작",
        "A구역으로 이동",
        "기지로 복귀",
        "거실로 와",
        "테이블까지 이동"
    ],

    // 2. AI 판단의 엄격한 기준 점수 초기 기본값 (0.0 ~ 1.0)
    // 화면이 켜질 때 이 값이 슬라이더의 초기 위치가 됩니다.
    threshold: 0.65,

    // 3. MQTT 기본 공용 브로커 및 포트 주소
    mqtt_broker: "wss://broker.emqx.io:8084/mqtt",

    // 4. 최초 진입 시 하단 입력창에 채워질 기본 토픽
    default_topic: "zumi01",
    // 🌟 [새로 추가] 최초 진입 시 수신(RX) 창에 채워질 기본 로봇 답장 토픽
    default_sub_topic: "zumi02"
};