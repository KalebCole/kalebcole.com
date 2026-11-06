# Frozen judge questions

These two files are byte-for-byte copies of the questions frozen on 2026-11-06. Do not edit them. Tests pin the sha256 of the file bytes.

| File | Version | sha256 |
| --- | --- | --- |
| `questions.baseline.v1.frozen.json` | `1.0.0-compact-for-capacity1` | `0e70f2631611957037a07d2e8afe044bd6b8d7534e6a5557f284b598d16fbc76` |
| `questions.visibility-only.v1.frozen.json` | `visibility-only-v1` | `8c44e4987ff58edff58c528e75e47c8408f4870f74ba7a75412a07b08560a89d` |

`questions.baseline.v1.frozen.json` is the original eight identity questions. A visibility question is not part of that request. The scorer refuses a baseline payload that contains `visibility_of_target`.

`questions.visibility-only.v1.frozen.json` is the prior position candidate (`target-leads`, `target-mentioned-later`, `target-absent`, `uncertain`). It is not `strict-visibility-win-v1`. Being first in a list can match `target-leads` on that older question, and that is not the approved win.

A fresh check on 2026-11-06 scored that position rubric only: ChatGPT's unambiguous slice was 3/3, Google was 4/4, and Gemini was 4/4. Those counts are not accuracy for the strict win. The answer text, screenshots, and local experiment paths from that check are not stored in this repo.

The visibility-only file contains one historical em dash in the question wording. The punctuation check skips that file only, so the hash can stay intact. Do not add another exception, and do not copy that dash into new writing.
