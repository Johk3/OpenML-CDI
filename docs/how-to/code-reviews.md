# How to Do a Code Review

Code reviews are not just about finding bugs; they are about sharing knowledge, keeping our codebase clean, and ensuring we all understand how the project works.

Because we are a team of 7 with different skill levels, reviews should always be constructive, kind, and educational.

---

## 🧑‍💻 For the Author (The person who wrote the code)

Your job is to make your code as easy to review as possible. For a detailed explanation, see [docs/how-to/pull-request-size.md](./pull-request-size.md).

1. **Keep it small:** Aim for PRs under 250 lines of code.
2. **Review your own code first:** Read through your "Files Changed" tab on GitHub _before_ requesting a review. Catch your own typos and leftover `console.log()` statements.
3. **Provide context:** Fill out the PR template completely. If you made a weird architectural decision because of a library limitation, leave an inline comment on your own PR explaining _why_.
4. **Link the issue:** Make sure the PR is linked to the original Scrum board task (e.g., `Closes #12`).

---

## 🕵️ For the Reviewer

When you are tagged to review a PR, try to do it within 24 hours so your teammate isn't blocked.

### Step 1: Understand the Goal

Before looking at the code, read the PR description and the linked issue . What is this code _supposed_ to do?

### Step 2: The High-Level Pass

Go to the **Files Changed** tab in GitHub. Don't read line-by-line yet. Look at the big picture:

- Are the files in the right folders?
- Does the architecture make sense?
- Are they using the right database models or React components?

### Step 3: The Line-by-Line Pass

Now read the code carefully. Use GitHub's inline commenting feature (click the `+` icon next to a line number) to leave feedback.

**What to look for:**

- **Logic:** Are there edge cases the author missed? (e.g., What if the uploaded dataset is completely empty?)
- **Security:** Are passwords being hashed? Are API keys hardcoded? (Flag hardcoded keys immediately!)
- **Readability:** Are variable names clear? (e.g., `dataset_file` instead of `df`)
- **Testing:** Did they include tests? Do the tests actually test the acceptance criteria?

### Step 4: Run it Locally

If it is a complex feature (like the file upload or authentication), pull their branch to your local machine and run it.

```bash
git fetch origin
git checkout feature/15-dataset-upload
```

Click the buttons. Try to break it.

### Step 5: Submit the Review

Click the green Review changes button in the top right. You have three options:

1. Comment: You have general feedback or questions, but it doesn't block the merge.
2. Request Changes: There is a bug, a missing acceptance criterion, or a major architecture flaw that must be fixed before this can be merged.
3. Approve: The code works, it meets the Definition of Done, and it's ready for the main branch.

### 🗣️ Tone and Etiquette

- Ask, don't tell: Instead of "You did this wrong, use a map function," try "Have you considered using a map function here? It might be cleaner."
- Praise good code: If someone wrote a really elegant solution, leave a comment saying so! Code reviews should highlight the good, not just the bad.
- Don't nitpick formatting: Let our automated linters (black for Python, eslint for React) argue about spaces and brackets. Focus your human energy on logic.

---

**Related:** [Code Review and Ownership Philosophy](../explanation/review-policy.md) | [Pull Request Size Guidelines](./pull-request-size.md) | [CI Pipeline](./CI-pipeline.md)

[← Back to documentation index](../index.md)
