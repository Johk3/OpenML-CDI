# Code Review and Ownership Philosophy
## Introduction

This document aims to highlight our principals when it comes to making decisions on who should be choosen and why when selecting people for code reviews.


## Our Core Review Philosophy

Our understanding is that a code review should achieve 2 things. First it should highlight to the author any mistakes made in the architecture and file layout as well as raise any concerns about logic, security, testablitiy and readability.
Second and more important to our philosophy is that a code review serves as a way for our team to be on the same page when it comes to implementation details. A team members should be assigned their own realm or part of the repository that they are most comfortable in. In case any modification is made by any contributor should trigger an automatic review and approval of the assigned code owner. In this way the assigned part are clearly understood by one person and we can establish responsibility over the assigned parts of our project.

## Balancing Quality and Velocity

There will be times when the codeowner is not available for a code review for any reason. In this case a majority vote should overwrite the need for the code owners approval.

## Related Resources
- Our codeowner configuration can be found at [.github/CODEOWNERS](../../.github/CODEOWNERS).
- For a guide on how to do code reviews see [how-to/code-reviews.md](../how-to/code-reviews.md)!

