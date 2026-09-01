## ADDED Requirements

### Requirement: Library page lists catalog with filters and direct borrow
The system MUST expose a `/movies` page to Bearer-authenticated callers (user and admin) that lists the catalog with pagination, filterable by `mood` and/or `scene` tags and a `keyword`, and MUST provide a per-title borrow control that calls the REST borrow endpoint. The page MUST reuse the catalog list and search endpoints; a filtered request MUST reach the search endpoint with the composed `mood`/`scene`/`keyword`/`page`/`limit` parameters. A borrow via this control MUST behave exactly like the REST borrow endpoint: success marks the title borrowed and decrements stock once; a conflict (`ALREADY_BORROWED`, `OUT_OF_STOCK`) MUST be surfaced as an in-page friendly message and MUST NOT cause a 500.

#### Scenario: Page renders paginated catalog
- **WHEN** a logged-in user opens `/movies`
- **THEN** the page lists catalog titles with pagination and each title has a borrow control

#### Scenario: Filters compose into a search request
- **WHEN** the user selects mood `治愈`, scene `雨天`, and a keyword `星际`
- **THEN** the page requests the search endpoint with `mood=治愈&scene=雨天&keyword=星际` and the pagination parameters, and renders the results

#### Scenario: Direct borrow succeeds through the REST path
- **WHEN** the user clicks borrow on an in-stock title they have not borrowed
- **THEN** the REST borrow endpoint returns 201, the title is marked borrowed on the page, the stock is decremented, and an `ACTIVE` rental and `BORROW_SUCCESS` log are created

#### Scenario: Borrow conflict stays in-page
- **WHEN** the clicked title is already actively borrowed or out of stock
- **THEN** the page shows a friendly message next to the title and the request does not produce a 500

### Requirement: Library page marks actively borrowed titles
The library page MUST mark titles the caller has actively borrowed, sourced from the rentals query filtered to `ACTIVE`, and MUST disable their borrow control showing a borrowed label. The borrowed set MUST be refreshed on page mount so that returning a title on the chat page makes it borrowable again on the library page. The page MUST NOT offer a return control — returning remains exclusive to the chat path.

#### Scenario: Actively borrowed title is marked and disabled
- **WHEN** the caller has an `ACTIVE` rental for a catalog title
- **THEN** that title shows a borrowed label and its borrow control is disabled

#### Scenario: Return elsewhere restores borrowability
- **WHEN** the caller returns the title on the chat page and reopens `/movies`
- **THEN** the title's borrow control is enabled again on the next page load

#### Scenario: No return control on the library page
- **WHEN** the caller views a borrowed title on the library page
- **THEN** no return control is offered there; returning happens only through the chat page
