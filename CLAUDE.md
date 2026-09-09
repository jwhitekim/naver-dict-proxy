# 프로젝트 규칙

투두앱 백엔드. FastAPI + PostgreSQL + Alembic.
설계 의도의 전문은 `docs/index.md`부터 시작해서 참조. 아래는 작업 시 반드시 지킬 규칙.

- 데이터 모델 왜: `docs/architecture/data-model.md`
- API 계약 왜: `docs/architecture/api-contract.md`
- 완료 판정 기준: `/verify-completion` 스킬
- 승인 게이트 기준: `/approval-check` 스킬
- 지금 안 만드는 것: `docs/scope.md`

---

## 완료 조건

작업 완료를 선언하기 전에 아래가 **전부 통과**해야 한다.

```python
pytest -q
mypy app/
ruff check
```

하나라도 실패하면 완료가 아니다. "대부분 통과했다"는 완료가 아니다.

**테스트가 실패하면 구현을 고친다. 테스트를 고치지 않는다.**
테스트 자체가 틀렸다고 판단되면, 고치지 말고 **먼저 사람에게 물어볼 것.**

`app/`가 생긴 뒤로는 세션 종료 시 Stop Hook(`.claude/settings.json`)이 위 3종을 자동 실행해서 강제한다. 실패하면 세션이 끝나지 않고 다시 작업으로 돌아간다.

---

## 절대 하지 말 것

- **물리 삭제 금지.** `DELETE FROM`, `session.delete()` 사용 금지. `deleted_at`을 채울 것 (D-001)
- `**completed_at`을 boolean으로 바꾸지 말 것.** 이력 보존이 목적이다 (D-002)
- `**deleted_at`을 API 응답에 노출하지 말 것.** 서버 구현 디테일이다
- `**models.py`와 `schemas.py`를 병합하지 말 것.** 중복은 의도된 것이다 (D-004)
- `**.env`, `.env.prod`, `secrets/` 읽거나 쓰지 말 것**
- `**.claude/settings.json` 수정 금지**
- **수정할 때마다 버전관리 안하지 말 것**

---

## 승인이 필요한 작업

아래는 코드를 작성해도 되지만 **실행은 사람 승인 후**에 한다.

- `alembic upgrade` — 마이그레이션 실행
- 배포 관련 명령
- `git push --force`
- 외부 API 쓰기 요청
- 테스트 파일 삭제/대량 수정

기준은 중요도가 아니라 **되돌릴 수 있는가**이다.

---

## 작업 순서

새 기능을 만들 때:

1. `schemas.py`에 Pydantic 스키마 정의 (API 계약 먼저)
2. 테스트 작성 (실패하는 상태로)
3. 구현
4. 검증 명령 3종 통과 확인
5. `models.py`를 바꿨다면 `alembic revision --autogenerate` (실행은 승인 후)

**계약과 테스트가 먼저다.** 구현부터 하면 구현에 맞춰 계약이 흔들린다.

---

## 코드 규칙

- 모든 시간 컬럼은 `DateTime(timezone=True)` (D-003)
- 모든 조회 쿼리에 `deleted_at IS NULL` 조건 포함
- ID는 UUID
- 한 커밋 = 한 논리적 변경. 스텝마다 커밋할 것

---

## 범위

아래는 **아직 만들지 않는다.** 요청받지 않았다면 먼저 제안하지 말 것.

- 반복 일정 (RRULE)
- 태그 / 프로젝트 분류
- 협업 / 공유
- 오프라인 동기화

---

## 불확실할 때

추측해서 진행하지 말고 물어볼 것.
특히 스키마 변경, 기존 동작 변경, 파일 삭제는 반드시 확인받는다.

---

## 작업 관리 (todo-guard)

### TODO.md 운영

- 사용자의 모든 지시는 즉시 TODO.md 「진행 중」에 `- [ ]` 로 등록한다. 등록 없이 착수 금지
- 항목을 마치면 `- [x]` 로 바꾸고 「완료」로 옮긴다. 실제로 끝나지 않은 것을 완료 처리하지 않는다
- 사용자 판단이 필요해 진행 불가한 항목만 `- [?] 항목명 (사유)` 로 둔다

### 문서 규칙

슬라이드·보고서(`.pptx` `.pdf` `.doc` `.txt` `.hwp` `.md`)를 만들 때는
`~/.claude/skills/todo-guard/rules/doc-rules.md` 를 **쓰기 전에 읽고** 적용한다.

턴을 끝낼 때 바뀐 줄을 자동 검사한다. 위반이 있으면 종료가 막힌다.

| 사용자가 말하면 | 실행 |
|---|---|
| 전체 검수해줘 | `python ~/.claude/skills/todo-guard/scripts/doc-guard.py --all` |
| 바뀐 것만 검수해줘 | `python ~/.claude/skills/todo-guard/scripts/doc-guard.py --changed` |
| 문서 규칙 꺼줘 / 켜줘 | `bash ~/.claude/skills/todo-guard/scripts/doc-toggle.sh off｜on` |

---

## 스킬

- `/plan` — 되돌리기 어렵거나 범위가 불확실한 작업 전에 계획부터 세운다. 코드 작성 전 사용.
- `/trim-claude-md` — 이 파일이 길어졌을 때(150줄 / 4000토큰 기준) 핵심 규칙만 남기고 배경 설명을 `docs/`로 옮긴다.
- `/verify-completion` — 작업 완료를 보고하기 전에 사용
- `/approval-check` — 승인 필요 액션 실행 전에 사용
- `/record-lesson` — 사람이 명시적으로 규칙 추가를 지시했을 때만 사용 (자동 트리거 안 됨)
