# Han Mobile

18구역 미니어처 무선충전 주차장의 **입차 등록 · 충전 현황** 휴대폰 앱입니다.

Unity 시뮬레이터와 아두이노 레일 제어기로 돌아가는 [Han] 프로젝트의 입력단을 휴대폰으로 옮긴 것으로,
차 번호 · 배터리 잔량 · 차종(총 용량) · 입/출차 시간을 폰에서 넣으면 Supabase를 거쳐 Unity에 반영됩니다.

빌드 도구가 필요 없는 **PWA(설치형 웹앱)** 입니다. GitHub Pages에 그대로 올라가고,
휴대폰에서 "홈 화면에 추가"하면 네이티브 앱처럼 전체화면으로 뜹니다.

---

## 구조

```
휴대폰 (PWA)  ──HTTPS──▶  Supabase (Postgres + PostgREST)  ◀──HTTPS──  Unity (SupabaseBridge.cs)
                                                                            │ 시리얼
                                                                            ▼
                                                                     Arduino (레일 · INA219)
```

- 앱은 **localStorage가 1차 저장소**입니다. 신호가 끊겨도 입력은 남고,
  전송 못 한 입/출차는 아웃박스에 쌓였다가 연결이 돌아오면 자동으로 올라갑니다.
- Supabase 설정을 비워두면 **로컬 모드**로 동작합니다 — 앱 단독으로 테스트할 수 있습니다.
- 현황 화면은 1초 주기로 테이블을 다시 읽습니다. 충전 중이면 배터리 게이지가 실시간으로 올라갑니다.

---

## 데이터 모델

입차 등록 시 넣는 값:

| 항목 | 설명 |
|---|---|
| 차 번호 | 자유 문자열 (`12가 3456`, 미니어처면 식별용 이름) |
| 차량 종류 | A/B/C/D — 최대 배터리 용량이 함께 정해집니다 |
| 현재 배터리 잔량 | 0~100 % |
| 입차 시간 | 기본값 = 현재 시각 |
| 출차 시간 | 기본값 = 입차 + 2시간 |
| 주차 구역 | A1~C6, 선택 안 하면 Unity가 배정 |

차량별 최대 용량은 아두이노 스케치의 `Vehicle vehicles[]` 와 같은 값입니다 (단위 mW·s = mJ):

| 차종 | 최대 용량 |
|---|---|
| Vehicle_A (기본) | 1,600 mW·s |
| Vehicle_B | 1,400 mW·s |
| Vehicle_C | 1,800 mW·s |
| Vehicle_D | 2,000 mW·s |

값을 바꾸려면 [`js/config.js`](js/config.js)의 `VEHICLES` 만 고치면 됩니다.

---

## 설치 · 실행

### 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 Run 합니다.
3. **Project Settings → API** 에서 두 값을 복사합니다.
   - `Project URL` — `https://xxxxxxxxxxxx.supabase.co`
   - `anon` / `publishable` key

> `anon` key는 클라이언트에 노출되도록 만들어진 공개 키입니다. 데이터 보호는 RLS 정책이 담당합니다.
> **`service_role` key는 앱이나 저장소에 절대 넣지 마세요.**
>
> `schema.sql`의 기본 RLS 정책은 실습 편의를 위해 익명 전체 접근을 허용합니다.
> 외부에 공개되는 환경이라면 파일 하단의 "운영용" 절로 바꾸세요.

### 2. 휴대폰에 앱 설치

배포된 주소를 휴대폰 브라우저로 엽니다.

- **iPhone (Safari)**: 공유 → *홈 화면에 추가*
- **Android (Chrome)**: 메뉴 → *앱 설치* / *홈 화면에 추가*

앱을 열고 **설정** 탭에서 위에서 복사한 Project URL과 anon key를 넣고 → **연결 테스트** → **저장**.
상단 띠가 `Supabase 연결됨` 으로 바뀌면 준비 끝입니다.

### 3. 로컬에서 실행

빌드가 필요 없습니다. 정적 서버만 있으면 됩니다.

```bash
python3 -m http.server 8000
```

`http://localhost:8000` 으로 접속합니다.
(`file://` 로 열면 ES 모듈과 서비스워커가 동작하지 않습니다.)

---

## Unity 연동

[`unity/SupabaseBridge.cs`](unity/SupabaseBridge.cs) 를 `Assets/` 에 넣고 빈 GameObject에 붙인 뒤,
인스펙터에서 Supabase URL과 anon key를 채웁니다.

브릿지는 데이터만 담당하고, 주차장 로직과의 연결은 이벤트로 붙입니다:

```csharp
using UnityEngine;

public class MobileLink : MonoBehaviour
{
    SupabaseBridge  bridge;
    ParkingManager  parkMgr;
    ArduinoBridge   arduino;

    void Start()
    {
        bridge  = FindFirstObjectByType<SupabaseBridge>();
        parkMgr = FindFirstObjectByType<ParkingManager>();
        arduino = FindFirstObjectByType<ArduinoBridge>();

        bridge.OnVehicleArrived  += Arrived;
        bridge.OnVehicleDeparted += Departed;
    }

    void Arrived(SupabaseBridge.VehicleRecord v)
    {
        string zone = string.IsNullOrEmpty(v.zone) ? PickFreeZone() : v.zone;

        parkMgr.SpawnCarAt(zone, Color.white);

        // 레일을 해당 구역으로 보낸다 ("a3" 같은 명령)
        arduino?.SendZoneCommand(zone);

        // 스케줄러에 등록하는 부분은 프로젝트의 현재 CarData 정의에 맞춰 채웁니다.
    }

    void Departed(SupabaseBridge.VehicleRecord v)
    {
        if (!string.IsNullOrEmpty(v.zone)) parkMgr.DepartCar(v.zone);
    }

    // 충전이 진행될 때마다 호출 — 앱 화면의 게이지가 따라 올라갑니다.
    void OnChargingTick(SupabaseBridge.VehicleRecord v, float pct, float measuredPowerMW)
    {
        bridge.PushState(v.id, pct, measuredPowerMW, status: "charging");
    }

    string PickFreeZone() => "A1"; // 실제 배정 로직으로 교체
}
```

`PushState()` 는 매 프레임 불러도 안전합니다 — 내부에서 `pushInterval` 주기로 묶어 보냅니다.
INA219 실측 전력(`PowerMonitor` 의 `powerMW`)을 그대로 넘기면 앱에 "충전 전력"으로 표시됩니다.

---

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 GitHub Pages로 배포합니다
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

최초 1회만 저장소 설정이 필요합니다:

**Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 변경.

---

## 파일 구성

```
index.html                    앱 셸
manifest.webmanifest          PWA 매니페스트
sw.js                         서비스워커 (오프라인 캐시)
css/app.css                   전체 스타일 (다크 전용)
js/config.js                  차종·구역·기본 설정 상수
js/store.js                   상태 + localStorage + 아웃박스
js/backend.js                 Supabase(PostgREST) 어댑터
js/util.js                    포맷팅·DOM 헬퍼
js/main.js                    진입점, 탭 전환
js/ui/register.js             입차 등록 화면
js/ui/status.js               주차 현황 화면
js/ui/settings.js             설정 화면
supabase/schema.sql           테이블 · 인덱스 · RLS 정책
unity/SupabaseBridge.cs       Unity 쪽 연동 스크립트
```

---

## 알려진 제약

- **실시간 갱신은 폴링(기본 1초)** 입니다. Supabase Realtime(WebSocket)으로 바꾸려면
  `supabase-js` 를 붙이고 `js/backend.js` 만 교체하면 됩니다.
- 구역 중복은 Supabase의 부분 유니크 인덱스로 막지만, 앱이 로컬 모드일 때는
  해당 휴대폰 안에서만 검사합니다.
- 인증이 없습니다. RLS 기본 정책이 익명 전체 접근이므로, 주소와 키를 아는 사람은 누구나
  읽고 쓸 수 있습니다. 공개 환경에서는 반드시 인증을 붙이세요.

[Han]: https://github.com/100qhf-cyber/Han_Mobile
