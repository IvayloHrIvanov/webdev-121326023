# UI checklist

<!-- Exercise 4 hands this in. Tick an item only when you have checked it, and replace
     the "how I checked" line with what you actually did. An unticked box is not a
     failure: it is a gap you then write into READINESS.md. A ticked box you cannot
     demonstrate at the defence is worse than an unticked one. -->

"Modern" is not a style. It is a short list of things a user notices when they are
missing: the screen tells you what is happening, you can get through it with a keyboard,
the text is readable, and nothing jumps around while it loads.

## Layout and typography

- [x] **One spacing scale and one type scale.** Sizes come from a small set of design tokens, not from numbers typed where they were needed.
  - how I checked: Inspected CSS styles in `public/login.html` and `public/sessions.html` and verified consistent font-family (`sans-serif`), padding/margin increments of 4px/8px/12px/15px/20px, and standardized header/body font sizes.
- [x] **Responsive at 380, 768 and 1280 pixels wide.** No horizontal scrollbar, no text running under another element.
  - how I checked: Tested viewports in browser developer tools at 380px (mobile), 768px (tablet), and 1280px (desktop), confirming responsive container widths and zero horizontal overflow.
- [x] **Nothing jumps while the page loads.** Images and cards reserve their space before their content arrives.
  - how I checked:  Inspected initial table container rendering and skeleton states on `/sessions`, verifying container cards maintain stable dimensions prior to async fetch population.

## The four states, on every screen

A screen that only handles "it worked" is a screen that lies to the user on the day it matters.

- [x] **Loading.** Something tells the user the app is working, within about 100 ms.
  - how I checked: Observed with low internet simulation and project build inizialization messages like: "Connecting to the forwarded port..." or "Render is loading" message.
- [x] **Empty.** The screen says what this list is for and what to do next, instead of showing nothing.
  - how I checked: Tested with a freshly seeded database without sessions, verifying tables display descriptive text such as `"No upcoming sessions."`.
- [x] **Error.** A sentence a person can read. Never a raw JSON body, never a stack trace, never just "Error".
  - how I checked: Submitted invalid credentials on the sign-in form and empty group names on the admin dashboard, verifying human-readable messages like `"Invalid email or password"` and `"Name cannot be empty"` in `.error` divs.
- [x] **Success.** The user can see that what they did took effect, without reloading the page to find out.
  - how I checked: Toggled session attendance ("Attend" / "Will Not Attend") and joined/left study groups, observing immediate UI state updates and success message banners without manual page refreshes.

## Keyboard and accessibility

- [x] **The main flow works with the keyboard alone.** Sign in, do the core action, sign out, without touching the mouse.
  - how I checked: Navigated through login inputs, submit buttons, attendance toggles, and sign-out buttons using Tab and Enter keys exclusively.
- [x] **The focused element is visible.** A `:focus-visible` outline that is not switched off.
  - how I checked: Inspected default browser focus rings on form inputs and interactive buttons during keyboard navigation.
- [x] **Text contrast is at least 4.5:1.** Name the tool you measured with.
  - how I checked: Measured color contrast using Chrome DevTools Lighthouse and CSS color inspection (dark text `#333` on `#ffffff` white container background; white text on `#007bff` primary buttons).
- [x] **Every input has a label** a screen reader reads, not just placeholder text.
  - how I checked: how I checked: Inspected HTML markup in `login.html` and `sessions.html`, confirming every `<input>` element has an explicit preceding `<label>` tag.
- [x] **The page has a correct `<title>` and `lang`.**
  - how I checked: Verified `<html lang="en">` and descriptive `<title>` tags present in the `<head>` of both `login.html` and `sessions.html`.
- [x] **Touch targets are at least 44 pixels.**
  - how I checked: Measured button padding and height dimensions in DevTools, confirming buttons exceed 44px vertical height and touch target sizing.

## The model feature

- [x] **It shows that it is thinking.** A model call is slow and a free service may have been asleep; a frozen button is the worst possible answer.
  - how I checked:  Clicked "Summarise Notes" in the AI Notes Summariser UI section and observed the button disable and display "AI is thinking..." while awaiting the model response.
- [x] **It shows when it failed,** and the rest of the screen still works.
  - how I checked: Simulated an API failure or timeout by triggering a request without valid API configuration, verifying that the error message is displayed while dashboard sessions and groups remain fully interactive.
- [x] **The user can tell the model's suggestion from a fact.** It is labelled as a suggestion, not presented as data the app knows.
  - how I checked: Inspected the summary result container, confirming it is explicitly labelled "AI Suggestion Result (Distinct from

## Decisions

- [x] **Dark mode, or a written decision not to have one.**
  - what I decided and why: mplemented dark mode as the default startup standard theme with an accessible toggle. This reduces eye strain, provides a modern aesthetic for academic study sessions, and ensures persistent theme preference storage via localStorage across pages.

## Evidence

<!-- Screenshots of at least the four states of one screen, and of the model feature
     thinking and failing. A link to them is enough; they do not have to be in the repo. -->
- ![Loading state](ui/loading_state.png)
- ![Error state](ui/error_state.png)
- ![Error state - Log-in](ui/error_state_log_in.png)
- ![Success state](ui/success_state.png)
- ![Model failing](ui/model-failing.png)