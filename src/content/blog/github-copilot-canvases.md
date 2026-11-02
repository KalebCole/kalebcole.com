---
title: "GitHub Copilot canvases and self-modifying software"
date: 2026-07-16
description: "How Copilot's extension model evolved into canvases, and why agent interfaces should adapt to our workflows."
tags: ["github-copilot-desktop", "agents", "canvases"]
draft: false
---

I want to talk about a new feature of the [GitHub Copilot app](https://github.com/features/ai/github-app) that I am enamored with: [Canvases](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)

Here is a demo of how a canvas works:

<figure>
  <video controls playsinline preload="metadata" width="2496" height="1664" aria-describedby="canvas-demo-description" src="/blog/copilot-canvases/canvas-demo.mp4">
    Your browser does not support embedded video. You can
    <a href="/blog/copilot-canvases/canvas-demo.mp4">download the demo instead</a>.
  </video>
  <figcaption id="canvas-demo-description" class="media-description">Video description (no audio): The GitHub Copilot app, with a chat on the left and a Repository Issues Kanban canvas on the right. The board shows seven issues across Backlog, Plan, Ready, Implement, and Done columns. Issue #1, “Add a compact project summary card”, is dragged from Backlog to Plan. The canvas then posts a message in the chat asking the agent to plan that issue in a background agent and move it to Ready when planning is done. The agent starts the planning task, and the card shows “Planning implementation”.</figcaption>
</figure>

GitHub docs give a good explanation of how canvases work (ask your agent to explain), and there's an inbuilt `create-canvas` skill in the app.

For this article, I want to focus on is where I think the idea came from, because canvases feel like the next tier of *self-modifiable software.*
## Origins

 Mario Zechner, the creator of [Pi](http://pi.dev/) introduced me to the idea of self-modifying software during
 during this [talk](https://www.youtube.com/watch?v=RjfbvDXpFls&t=359s) at AI engineer back in April.

He described how Claude Code changes the context of your session by updating it's system prompt and tool definitions with each new release. Mario even made a tool to track the changes [cchistory: Tracking Claude Code System Prompt and Tool Changes](https://mariozechner.at/posts/2025-08-03-cchistory/).

His thesis was: everyone is trying to tailor workflows to the coding agent (everything needs to be terminal-first), but we should instead tailor the coding agent to our workflows.

Every project has different needs, different UIs, different processes. The agent should respect that.

His implementation of self-modifiable software is Pi,  a CLI coding agent with a terminal user interface (TUI).  You are allowed to modify it through [Pi extensions](https://pi.dev/packages), meaning you can update it's interface (granted you are still constrained by a terminal) or add features that you want to the agent to tailor to your workflow.

## From extensions to canvases

It wasn't that long after his talk (and Pi becoming more viral) that Copilot CLI team came out with the extensions feature (which I think might still be in experimental mode?). This was enabled by the team decoupling the [agent harness](https://martinfowler.com/articles/harness-engineering.html) from the TUI and creating the [GitHub Copilot SDK](https://github.com/github/copilot-sdk).

Here is Node documentation of extensions in the SDK: [copilot-sdk/nodejs/docs/extensions.md at main · github/copilot-sdk](https://github.com/github/copilot-sdk/blob/main/nodejs/docs/extensions.md).
(note that if you want to build an extension, you will need to point your agent to docs like this or else it will get confused with whatever these extensions are: [Marketplace](https://github.com/marketplace?type=apps&copilot_app=true))

I would encourage you to read the docs (and ask your agent), but here's the way that I understand how extensions work:
1. Starting a Copilot CLI session spawns a separate extension process with **bidirectional** communication to the session.
2. The extension can observe tool calls, send tool calls to the agent, and expose state that the agent can create, read, update, and delete.

And so people internally at Microsoft were just coming up with different ways to create extensions that extend the capability of the CLI harness. An example (and shoutout to [Casey Irvine](https://caseyirvine.dev/)) is [build-watcher](https://github.com/cirvine-MSFT/copilot-toolkit/tree/main/extensions/ado-build-watcher), which extends the CLI experience by polling the status of an Azure DevOps pipeline run and injecting the result into the Copilot session.

And then, internally, I believe the transition came from Steve Sanderson, who works on the copilot CLI team (and is also so awesome to listen to and so engaging), starting sharing UI-based extensions. Check out this [open source repository](https://github.com/SteveSandersonMS/copilot-webview-creator) which extends the CLI with a custom UI.
Here's his YouTube video as well: [How to extend Copilot CLI with custom UI](https://www.youtube.com/watch?v=HcjUnrS41II)

<picture>
  <source type="image/webp" srcset="/blog/copilot-canvases/copilot-webview-extension-1120.webp">
  <img src="/blog/copilot-canvases/copilot-webview-extension-1120.png" width="1120" height="644" loading="lazy" decoding="async" alt="Copilot CLI beside a canvas extension showing a visual workflow">
</picture>

This allowed for a visual interface for the Copilot CLI but there is a notable UX limitation: you have two different surfaces that you are working in.

and so....

Let's unify the interfaces and bring it together!

## Conclusion

Given this history, I believe this is how a team decides to create the canvas feature - the next step in self-modifiable software.

It is a GitHub Copilot extension but with a `canvas.json` file in the repo which allows it to render in the GitHub Copilot desktop app.

That is it. If you understand extensions, you will understand canvases.

Here are some examples that I recommend viewing for inspiration:
[Backlog Swipe Triage | Awesome GitHub Copilot](https://awesome-copilot.github.com/extension/backlog-swipe-triage/)
[Repository Issues Kanban | Awesome GitHub Copilot](https://awesome-copilot.github.com/extension/accessibility-kanban/)

I myself have not had success building actually useful canvases yet, but I am excited to start building and passionate about this idea of self-modifiable software.
