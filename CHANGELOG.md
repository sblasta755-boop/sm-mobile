# Native app changelog

Own versioning (not the store version in `app.json`): `MAJOR.MINOR.PATCH`. MAJOR = breaking change, MINOR = new feature, PATCH = fix or internal change.
Newest first. One entry per piece of work.

## 0.6.0 - 2026-11-26
### Added
- Notification settings: attendance (with its three kinds), schedule, and people and sites switches for the roles that receive them.
- Quiet hours (three presets) and "Pause phone alerts" for 1 hour, 8 hours or until tomorrow, with "Resume now".
- Daily attendance summary (organisation admins and operations managers): choose when it arrives (12:00, 16:00, 18:00 or 20:00) and limit it to your own sites.
- "Where you get notifications": switch the notifications bell (in-app) and email on or off, next to push.

## 0.5.0 - 2026-11-25
### Added
- "Hourly rounds" notification setting.
### Changed
- Tapping a push alert, or Open on a notification, marks it read.
- "Rounds" notifications open the task screen.
- PDF report: same layout fixes as web (insight cap, full organisation names, no false "new").

## 0.4.0 - 2026-11-25
### Added
- Platform Notifications screen: **PDF report** button (A4 PDF with page footer, shared via the share sheet; `notificationReportHtml.ts`).

## 0.3.0 - 2026-11-25
### Added
- Maintenance Remind button and sheet, blocking reminder popup (ignore needs a reason), History indicators, reminder settings screen.

## 0.2.0 - 2026-11-25
### Added
- Roster draft bar with save/discard and one batched send per person.
- Platform Notifications screen (overview, people, roles, common, log, guard).

## 0.1.0 - baseline
- Starting point for this changelog.
