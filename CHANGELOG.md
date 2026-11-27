# Native app changelog

Own versioning (not the store version in `app.json`): `MAJOR.MINOR.PATCH`. MAJOR = breaking change, MINOR = new feature, PATCH = fix or internal change.
Newest first. One entry per piece of work.

## 0.11.1 - 2026-11-27
### Changed
- Suspending someone from the Team tab asks first.

## 0.11.0 - 2026-11-26
### Added
- Team tab: tapping a person now shows Edit and Delete for managers whose level covers them. Edit changes role, site (or the sites an operations manager owns) and status; Delete asks first and offers archiving as the alternative. Suspend (Reactivate once suspended) sits beside them. Add staff already lived on the same tab.
### Changed
- Add staff offers only the management roles the person adding may hand out: a site manager can add site managers, an operations manager can add operations managers and site managers, an administrator any.

## 0.10.0 - 2026-11-26
### Added
- Organisation and site settings screen (Profile > Settings, for administrators, operations managers, site managers and supervisors), independent of any module: scope chips (Organisation, then each site, with search once there are more than six) and Operating days, Working hours and Public holidays sections. The organisation sets a default and a site follows it or has its own, with a "Use the organisation default" switch on each field.
- Working hours can now be set on the phone (they could only be set on the web before), for the organisation and for each site.
- Public holidays can be viewed, added, removed and seeded on the phone.
### Changed
- The operating days panel moved from the bottom of Book staff to the new screen, which Book staff links to.
- Leave and paid leave follow the days the person's site operates, not Monday to Friday.

## 0.9.0 - 2026-11-26
### Added
- Operating days and closures: a month calendar. Tap a date to close just that day, or open a day the weekly pattern closes; tap again to undo. Open days are green, closed red, public holidays shown when the site closes on them.

## 0.8.0 - 2026-11-26
### Changed
- Schedule: days a site is shut are now blocked. The roster shows Closed and cannot be tapped on those days; the calendar greys them and hides "Book staff on this day"; Book staff greys closed days in the date picker and leaves them out of ranges, saying how many were left out.
- Saving operating days or closures asks before cancelling upcoming bookings that fall on a closed day.
- Timesheet review shows "Site closed" instead of "No show" for those bookings.

## 0.7.0 - 2026-11-26
### Added
- Schedule, below Shifts: "Operating days and closures". Choose the days a site is open (every day by default), whether it closes on public holidays, and add dated closures (holiday, maintenance, makeover or other, with a reason). Same setting as the web app.

## 0.6.1 - 2026-11-26
### Changed
- My Tables, "orders waiting for you": redesigned. A header in the brand colour with a pulsing bell (still when reduced motion is on) and a count, then one tappable row per order showing the table, the order number, the item count and how long it has waited (amber after 5 minutes, oldest first). Replaces the flat box whose dark text was hard to read on a red brand colour.

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
