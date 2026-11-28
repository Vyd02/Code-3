# Code 3 change log

Every change is its own commit, so any one can be undone without touching the others.

## Restore points

| Branch | What it is |
|---|---|
| `before-extras` | The app right before the Nov 27 extras below (3 tabs, everything else as it was) |
| `before-redesign` | The app before the bottom tabs / truck page redesign |

## Nov 27, 2026: extras

| # | Feature | Commit | What changed |
|---|---|---|---|
| 1 | One Move button | `ff8b913` | Big Move button on the truck page. It goes to the next spot. If the spot is taken, it offers to move the whole line or pick another spot. At F5 it asks Sign off or Down To. Old buttons are now under "Other spot…" and "◂ Back". |
| 2 | Sign-off checklist | `c95d1c3`, removed in `0ba59fd` | Removed. David didn't want it. |
| 3 | Line move animation | `eff67a0` | On the floor map, trucks slide one after another from the front of the line, leaving dust puffs, and the road flashes yellow. Moves made on the Trucks tab play when you open Floor. |
| 4 | Down To parts log | `670b88c` | Down To trucks list the OEM parts they're waiting on, with the date ordered and days waiting. Admins add parts, mark them Arrived (sends an alert) or remove them. |
| 5 | Weekly recap | `bb97df8` | Every Monday at 7 AM Eastern, everyone gets a summary of last week. Owner and co-owners can send themselves a preview from More › Line stats. (Alert server change.) |
| 6 | Due date countdown | `b913de9` | "Due today" / "N days left" tag when a truck is due within 7 days (bright at 2 days or less), and a "due this week" filter chip. |
| 7 | 10-second Undo | `5f7f6e9` | Undo stays up 10 seconds with a timer bar, the button isn't cut off, and undoing a move alerts everyone. |
| 8 | Photos on trucks | `6da0de6` | Photos section on the truck page. Admins, supervisors and inspectors can add photos (shrunk on the phone) with a note. Saved in `trucks/{id}/photos`. |
| 9 | Alerts organized | `d704877` | Filter chips (All, Moves, Down To, Sigs, Holds & late), grouped by day, line moves back to back merged into one ("The line moved 4 times"), compact rows with the time on the right. |
| 10 | Undo out of the way | `d704877` | No more Undo bar at the bottom. Messages show briefly at the top-left; a small "↶ Undo" pill sits in the top-right corner for 10 seconds. (Changes feature 7.) |
| 11 | Hold removed | `6a6625c` | Put on hold button, On hold banner/tag, floor-map hold dot, hold alerts and the On hold stat are hidden, since Down To covers it. One switch in the code (`HOLDS`) brings it back. |
| 12 | More alert sections | `a195c10` | Moves, Bubble, Next Truck, Down To, Parts, Sigs, Signed off, Late, each with a count. Single truck moves now show too. |
| 13 | Bubble can't go back | `cce9472` | Trucks in the Bubble can't be moved back to Stations 1–15. |
| 14 | Photos by station | `1694e17` | Each photo saves its station; the Photos section groups them by station in line order. Needs the updated rules. |
| 15 | Accounts on stations | `440d33c` | Admins check off people with accounts on each station. Non-admins can only add photos for their own stations. Needs the updated rules. |
| 16 | People: stations + search | `ccb5006` | Assign stations to each person from People, search people by name or email, and the Remove button is no longer squished. |
| 17 | View-as hides owner tools | `4c577f1` | Viewing as Supervisor, Inspector or Employee hides People and the recap preview, like a real one would see. |
| 18 | Inspector as an add-on | `4359f5d` | Inspector is a checkbox on top of Supervisor or Employee instead of its own role. Needs the updated rules. |

### Database rules changed
- Photos: new `match /trucks/{id}/photos/{pid}` block (feature 8).
- Feature 2 added `'cl'` for supervisors; it was removed again with the checklist.

### How to undo one feature
Tell Claude "undo feature N". It runs `git revert <commit>` for that row and pushes. The other features stay.

### How to undo all of them
Tell Claude "go back to before-extras". It resets the app to that branch.
