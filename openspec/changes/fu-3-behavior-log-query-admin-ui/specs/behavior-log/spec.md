## REMOVED Requirements

### Requirement: No log query surface in this change
**Reason**: FU-3 的既定范围就是补上查询面（BehaviorLog 查询与流水 UI）；「仅写入」降级为写入侧的 append-only 红线（不提供修改/删除端点），由下面的 admin 查询需求替代。
**Migration**: 查询能力由新需求「Admin queries the behavior log feed」提供，仅 admin 可见；无数据迁移之外的动作。

## ADDED Requirements

### Requirement: Admin queries the behavior log feed
The system MUST expose `GET /api/behavior-logs` for admins only, returning a `createdAt`-descending, paginated feed (`page`, `limit` default 1/20, max 100) with optional `action` enum filter and optional `userId` UUID filter. Each item MUST include the log fields plus the user's email, the resolved `movieTitle` for a single-`movieId` row, and `recommendCount` (length of the RECOMMEND payload's movie ids) instead of the raw payload. Non-admin callers MUST receive 403 `FORBIDDEN`; an invalid `userId` MUST return 400 `INVALID_USER_ID`; an unknown `action` MUST return 400 `VALIDATION_ERROR`. The system MUST NOT provide any endpoint that updates or deletes behavior-log rows.

#### Scenario: Admin lists a resolved feed
- **WHEN** an admin requests the feed after a recommend and a borrow have been logged
- **THEN** rows are ordered newest-first and include the user's email, the movie title for the borrow row, and a recommend count for the recommend row, with no raw payload in the response

#### Scenario: User role cannot list
- **WHEN** a `user` role requests the feed
- **THEN** the response is 403 with code `FORBIDDEN`

#### Scenario: Filter validation
- **WHEN** the feed is requested with an unknown action or a non-UUID userId
- **THEN** the response is 400 with `VALIDATION_ERROR` or `INVALID_USER_ID` respectively

#### Scenario: Append-only is preserved
- **WHEN** any client sends DELETE, PUT, or PATCH to a behavior-log path
- **THEN** no such route exists and no log row is modified or removed
