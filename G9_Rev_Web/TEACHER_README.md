# Grade 9 Computer Science Revision Lab

This independent website contains 38 varied Computer Science practice questions, with 85 guided points, worked explanations, a personal progress tracker and animated lessons.

## Use and hosting

Upload the complete contents of `dist/` to a static web host, retaining the directory structure. In the downloadable ZIP, these files are already at the root of the extracted folder, so upload that complete folder. The entry point is `index.html`. Reveal.js and all media are bundled locally. The app does not require a build step or application backend. The ChatGPT-hosted copy has its own host-managed access policy.

The downloadable website folder can also be opened locally using `index.html` in a modern browser. A static web host is recommended for consistent caption and browser-storage behavior.

## Student workflow

1. Start in Overview or choose a topic.
2. Work through the mixed practice bank in Workshop, or filter by topic and task type.
3. Check the guided responses, read hints, and reveal solution steps.
4. Repeat questions without opening a solution to confirm recall.
5. Start a 60-minute timed challenge and review the resulting score out of 50.

Every new timed challenge selects a fresh 50-point set from the whole practice bank, covers every topic and shuffles the question order. Repeated starts avoid the same consecutive question set. Refreshing or returning to an active challenge restores its saved selection and deadline.

Guided checks support learning. Full written tasks and marking rubrics remain available so students can practise complete answers on paper. A fresh correct attempt without opening the solution confirms independent recall.

## Progress and privacy

Progress is saved in the current browser, separately for this grade. Export and import the progress JSON to transfer it between devices. Existing workshop progress is carried into the updated bank. Earlier timed sessions without a saved question selection cannot be resumed; workshop progress and available score history are kept. Browser-data clearing removes local progress. There are no analytics trackers, student accounts or network progress uploads in the application.

## Source and media

`dist/data.js` contains the website question bank. `source/grade9-data.json` contains its editable JSON source and animation storyboards. The UI is in `dist/app.js`, scoring and progress validation are in `dist/core.js`, and the responsive themes are in `dist/styles.css`.

The videos are rendered with Manim Community 0.22.1, at 1280 by 720 pixels and 15 frames per second. Each has chapter metadata, a poster and WebVTT captions. The generator is provided in `source/render_manim.py`; after installing its requirements and native Cairo/Pango dependencies, run it beside the grade data with `--grade 9`. Its output manifest and assets can then replace the matching files under `dist/animations/` and `dist/animations.js`.

Reveal.js 6.0.2 is bundled under `dist/vendor/`; its MIT license is included. The school branding and teaching content belong to this educational project.
