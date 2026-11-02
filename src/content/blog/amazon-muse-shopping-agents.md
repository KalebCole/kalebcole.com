---
title: "Amazon, Muse, and the fight over the shopping front door"
date: 2026-10-16
description: "Muse may have strong consumer adoption, but Amazon is pushing back against the idea that a customer’s personal agent can use its store on the customer’s behalf."
tags: ["agents", "commerce", "amazon", "muse"]
draft: false
---

Meta recently released their personal AI agent, Muse, at Meta Connect 2026. On [David Senra's podcast](https://www.davidsenra.com/episode/alexandr-wang), Meta chief AI officer and Scale AI co-founder Alexandr Wang said reposted third-party charts "would imply" that Muse is the fastest-growing consumer AI app of all time.

Then Amazon blocked Muse from shopping on Amazon.com for customers. [GeekWire reported](https://www.geekwire.com/2026/amazon-blocks-metas-muse-ai-assistant-in-new-standoff-over-agentic-shopping/) that Amazon said Meta had not told it Muse would access the store, that the agent did not identify itself while browsing, and that this could create privacy and security risks. Amazon also asked Meta to remove Amazon from Muse.

Amazon’s position is that a business should know when an agent is acting for a customer, and customers should not have to trade away security or privacy just to use an agent. The problem is that a customer who chooses Muse is still a customer making a choice about how they want to shop.

Is Amazon protecting customers here, or protecting the part of its business that has the most to lose when agents become the new front door?

## The case for letting customers choose

Paul Graham, founder of Y Combinator, had this take:

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/paul-graham-amazon-agents.webp">
    <img src="/blog/muse-amazon-agents/paul-graham-amazon-agents.png" width="1256" height="436" loading="lazy" decoding="async" alt="Paul Graham's post on X about Amazon banning agents and the opportunity for a startup competitor.">
  </picture>
  <figcaption><a href="https://x.com/paulg/status/2108011311229747525">Paul Graham on X</a></figcaption>
</figure>

He followed with:

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/paul-graham-agent-restrictions.webp">
    <img src="/blog/muse-amazon-agents/paul-graham-agent-restrictions.png" width="1266" height="1038" loading="lazy" decoding="async" alt="Paul Graham's follow-up posts on X about companies that ban agents.">
  </picture>
  <figcaption><a href="https://x.com/paulg/status/2108011311229747525">Paul Graham’s follow-up posts on X.</a></figcaption>
</figure>

When a company does not adapt to a platform shift, it creates a competitive advantage for the companies that do. If people want agents to shop for them, openness to agents becomes part of why customers choose one marketplace over another.

## Some merchants are choosing a different model

The major ecommerce platform, Shopify, has a very different viewpoint on this. They have a direct integration with Muse through the Muse Connector Store.

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/muse-shopify-connector.webp">
    <img src="/blog/muse-amazon-agents/muse-shopify-connector.png" width="1604" height="1198" loading="lazy" decoding="async" alt="Muse settings showing Shopify in the Connectors section with a Connect button.">
  </picture>
  <figcaption>Muse’s Shopify connector, as shown in the settings interface.</figcaption>
</figure>

Shopify documents a channel in which eligible merchants on their platform can offer direct checkout on Muse. Merchants also have the option to deactivate Shopify Catalog access or direct checkout; if they turn off direct checkout, people can still discover products and are redirected to the merchant's own store to complete the purchase. Muse can then use the browser and Stripe's Link Wallet to purchase. [Shopify Help: Selling on Meta](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/meta)

> “You remain the merchant of record, and you continue to manage fulfillment, returns, and customer service for these orders.”


Meta said at Meta Connect 2026 that it was adding shopping connectors for other retailers like Walmart, Best Buy, American Eagle Outfitters, DICK’S Sporting Goods, Fanatics, Gap, Michael Kors, Sephora, Ulta, Wayfair, and Instacart, with Shop Pay and PayPal payment connectors and Expedia for travel. [Meta Connect roundup](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026)

Stripe, the payment processor company, [announced](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link) that Muse integrated Link's wallet for agents. Link can generate a one-time-use card, so a person's real card details stay hidden while the person still approves the purchase in Muse.

<figure>
  <video controls playsinline preload="metadata" width="720" height="720" style="width: 100%; height: auto;" aria-describedby="link-wallet-demo-description" src="/blog/muse-amazon-agents/jeff-titterton-link-wallet-muse-demo.mp4">
    Your browser does not support embedded video. You can <a href="/blog/muse-amazon-agents/jeff-titterton-link-wallet-muse-demo.mp4">download the video instead</a>.
  </video>
  <p id="link-wallet-demo-description" class="media-description">Video description: A phone showing a chat with Muse. The person asks for the cheapest non-stop flight from Boston to Dublin, leaving October 14 and returning October 21. Muse finds a non-stop Shamrock Air flight for $470.00, the person says it sounds great and enters their name, birth date, and passport details, and Muse asks whether to complete the booking. Muse then shows a Link by Stripe approval card: “Muse wants to spend $470.00 at shamrockair.com”, paid with a Chase Sapphire card ending in 4242, with Deny and Allow buttons. After Allow, Muse confirms the booking with a flight number and confirmation code. The video ends on the Link logo.</p>
  <figcaption>Video by Jeff Titterton for Stripe, originally published on <a href="https://www.linkedin.com/posts/jefftitterton_at-stripe-sessions-we-launched-links-wallet-ugcPost-7503179400813629441-AG7H/">LinkedIn</a>. The video has no audible speech.</figcaption>
</figure>


## What Amazon says about itself

In Amazon's 2025 10-K, it states first and foremost that it is customer-centric:

> “We seek to be Earth’s most customer-centric company. We are guided by four principles: customer obsession rather than competitor focus, passion for invention, commitment to operational excellence, and long-term thinking. In each of our segments, we serve our primary customer sets, consisting of consumers, sellers, developers, enterprises, content creators, advertisers, and employees.”

[Amazon 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm)

## Their business model

Its [Q2 2026 earnings release](https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-Second-Quarter-Results) describes Amazon bringing together Rufus and Alexa+ as Alexa for Shopping:

> “Brought together Rufus and Alexa+ into Alexa for Shopping, an agentic AI shopping assistant that offers personalized recommendations, product comparisons, price history, and the ability to automate shopping through features like Price Alerts and Auto-Buy. Worldwide customer adoption and engagement accelerated in Q2, with active users close to doubling and interactions up over 5x year-over-year.”

Amazon also says its own shopping assistant drives valuable behavior:

> “Alexa continues to drive meaningful momentum for the business, including in the U.S., where customers who use Alexa for Shopping spend an average of over 40% more per order than those who don’t, and customers who have tried Alexa+ are signing up for Prime at a nearly 25% higher rate.”

The release reported:

- $19.809 billion in Q2 advertising-services revenue, up 26% year over year. Amazon defines this category as sales through sponsored ads, display, and video advertising.
- $46.780 billion in third-party seller-services revenue, which Amazon defines as commissions and related fulfillment and shipping fees.
- $70.432 billion in online-stores revenue.
- Third-party sellers accounted for 61% of worldwide paid units.
- More than 40% more items were delivered same-day or overnight for Prime members in the first half of the year, while Amazon Now expanded 30-minute delivery.

## My take given this

Amazon has many customer segments and real reasons to care about consent, security, and reliability. **But a customer who selects Muse is also a customer making a choice about how they want to shop.**

These parts of their business model help explain why Muse could threaten Amazon's existing economics: discovery and recommendations, sponsored-product advertising, checkout initiation, third-party seller commissions and services, fulfillment and shipping revenue, first-party retail, Prime and Alexa engagement, and Amazon's position as the shopping front door. An outside agent can compare Amazon's delivery network with other merchants instead of treating Amazon as the default place to begin.

## This has happened before

I have been listening to [Acquired's episode on Google's origins](https://www.acquired.fm/episodes/google), and I see a pattern in Amazon's decision: should a company keep people inside the current interface, or help them reach what they came for as quickly as possible?

In 1997, Larry Page and Sergey Brin were trying to license BackRub, the search technology that became Google, to existing search engines and portals. They came close to a roughly $1 million licensing deal with Excite. The plan was for Excite to use BackRub’s ranking technology, with Larry and Sergey working there over the summer to implement it.

At a final side-by-side demonstration, BackRub’s results were dramatically more relevant. David Rosenthal and Ben Gilbert describe the problem this created for Excite:

> **David Rosenthal:** “The CEO is like, why on earth would we move to your algorithm? I want people to stay on my site. I make money when people stay on my site. I don’t want them to leave my site. You guys are crazy. Get out of here. I’m killing the whole deal.”
>
> **Ben Gilbert:** “It is amazing that as early as 1996–1997 this time period, this very important conflict of interests is teased out. This is basically why Google beat Yahoo.
>
> There’s a lot more to it, **but the portals all had this mentality of we want to build more and more and keep people on our site, in our ecosystem, continue to look at our banner ads.**
>
> **Google from this point, basically forever was how quickly can we deliver someone something relevant so they can leave Google and I’ve had a good experience finding what they really wanted?”**
>
> **David Rosenthal:** “Now all this is laughable in hindsight, but made total sense at the time because what was the business paradigm for all these sites? What was the model? It was banner ads, it was CPM, cost per thousand views. You wanted page views and impressions on your site. Here what BackRub is doing is they’re going to kneecap your page views.”
>
> **Ben Gilbert:** “They’re going to dramatically reduce the number of page views and allocate them to other properties on the web so they can leave your property.”

The Google story shows what happens when a company values preserving its existing business model over the customer experience. Consumers are choosing agents because they save time. An agent that helps people save time and decide what to buy threatens the attention and control Amazon monetizes.

Amazon’s decision to block Meta Muse is one Mark Zuckerberg has a clear opinion on. On the Cheeky Pint podcast, he said:

> “But we have way more businesses that are calling us asking to integrate deeply, and very few really who have tried to block it. And my guess is that the ones that try to block it, it will end up not being the right strategic thing for them. But we’ll see. This will kind of play out over time.”

[Cheeky Pint: *Muse Wonder: Zuckerberg and Wang's 100B AI*](https://open.spotify.com/podcast-chapter/0qLTNDAQgZBOdrmyC7BkpA?utm_source=native-share-menu)


## A path through the conflict

Sierra has announced the [Personal Agent Protocol](https://sierra.ai/blog/introducing-personal-agent-protocol), an open protocol effort it is developing with Meta and industry partners including Genesys, Instinct, Rocket, Shopify, Stripe, and Walmart. The goal is straightforward: give a customer’s personal agent a recognized way to interact with a business without forcing that agent to impersonate a human clicking through a website.

The proposed model is deliberately balanced. Customers choose what access to grant their agent, including read-only versus write access. Businesses decide what capabilities to expose and under what parameters. An agent could begin as a guest, then move into an OAuth-based session when account access is needed. Companies could support it through their existing websites, APIs, MCP, or their own agents.

That is not a finished standard yet. Sierra says it plans to publish the v0.1 specification, hold design workshops, and release a reference implementation later this month. Still, it is a useful sketch of what a more functional agent-to-business internet could look like.

## My take

I see Amazon blocking a customer-chosen agent from shopping as anti-consumer. It puts Amazon's control over discovery, recommendations, interface, advertising inventory, checkout initiation, and the customer relationship ahead of customers' choices. That feels in direct conflict with a company that says it seeks to be Earth’s most customer-centric company.

A blanket block is not the only choice. The Personal Agent Protocol shows one possible way through the conflict. Maybe Amazon is waiting for a more formal specification. I hope so.

Agentic commerce will become the default way to shop. Companies that force customers back into their own interface repeat the mistake of the search portals Google outcompeted: treating control of the interface as more valuable than helping people get where they want to go. That creates a competitive advantage for the companies that adapt.
## Sources

- [GeekWire: Amazon blocks Meta's Muse AI assistant](https://www.geekwire.com/2026/amazon-blocks-metas-muse-ai-assistant-in-new-standoff-over-agentic-shopping/)
- [Meta: Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent)
- [Meta: The biggest news from Connect 2026](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026)
- [Shopify Help: Selling on Meta](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/meta)
- [Stripe: Link in Muse](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link)
- [Amazon 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm)
- [Amazon Q2 2026 results](https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-Second-Quarter-Results)
- [Paul Graham on X](https://x.com/paulg/status/2108011311229747525)
- [David Senra: Alexandr Wang](https://www.davidsenra.com/episode/alexandr-wang)
- [Acquired: Google Part 1, Origins of Search](https://www.acquired.fm/episodes/google)
- [Cheeky Pint: *Muse Wonder: Zuckerberg and Wang's 100B AI*](https://open.spotify.com/podcast-chapter/0qLTNDAQgZBOdrmyC7BkpA?utm_source=native-share-menu)
- [Sierra, “Introducing Personal Agent Protocol”](https://sierra.ai/blog/introducing-personal-agent-protocol)
