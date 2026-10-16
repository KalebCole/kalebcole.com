---
title: "Amazon, Muse, and the fight over the shopping front door"
date: 2026-10-16
description: "Amazon says it blocked Meta's Muse over consent and security. I think the conflict is also about who gets to control how customers shop."
tags: ["agents", "commerce", "amazon", "muse"]
draft: false
---

Meta introduced its personal AI agent, [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), at Connect 2026. Meta has said Muse has millions of users. On David Senra's podcast, Meta's chief AI officer and Scale AI cofounder Alexandr Wang said that reposted third-party charts "would imply" Muse is the fastest-growing consumer AI app ever.

> David Senra: "Do you talk about how many people are using Muse? Are you guys talking about this publicly or no?"
>
> Alexandr Wang: "We have said millions and then I have retweeted other people who have shown graphs where we would imply that Muse is the fastest growing consumer app of all time. Consumer AI app of all time."
>
> David Senra: "So you won't say a number though."
>
> Alexandr Wang: "We've said millions."

[Listen to David Senra's interview with Alexandr Wang.](https://www.davidsenra.com/episode/alexandr-wang)

Then Amazon blocked Muse from shopping on Amazon.com for customers. [GeekWire reported](https://www.geekwire.com/2026/amazon-blocks-metas-muse-ai-assistant-in-new-standoff-over-agentic-shopping/) that Amazon said Meta had not told it Muse would access the store, that the agent did not identify itself while browsing, and that this could create privacy and security risks. Amazon also asked Meta to remove Amazon from Muse.

Amazon's position is reasonable in one important sense. A business should know when an agent is acting for a customer, and customers should not have to trade away security or privacy just to use an agent. The problem is that a customer who chooses Muse is still a customer making a choice about how they want to shop.

That is the tension here. Muse may have strong consumer adoption, but Amazon is pushing back against the idea that a customer's personal agent can use its store on the customer's behalf.

## The case for letting customers choose

Paul Graham made the competitive argument bluntly:

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/paul-graham-amazon-agents.webp">
    <img src="/blog/muse-amazon-agents/paul-graham-amazon-agents.png" width="1256" height="436" loading="lazy" decoding="async" alt="Paul Graham's post on X: Amazon banning agents creates an opportunity for a startup to build an Amazon competitor because people will want agents to buy things for them, and will not want to use an Amazon-supplied agent.">
  </picture>
  <figcaption><a href="https://x.com/paulg/status/2108011311229747525">Paul Graham on X</a></figcaption>
</figure>

He followed up with an even broader claim: "Any business that bans agents represents an opportunity for a startup to create a competitor." His reasoning is simple. If people want to use agents and a company refuses them, a competitor can make support for agents part of its pitch.

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/paul-graham-agent-restrictions.webp">
    <img src="/blog/muse-amazon-agents/paul-graham-agent-restrictions.png" width="1266" height="1038" loading="lazy" decoding="async" alt="An X thread where Paul Graham writes that businesses banning agents create an opening for competitors, adds 'Your usage restrictions are my opportunity,' and agrees that the group excluded by Amazon will grow to include most buyers.">
  </picture>
  <figcaption><a href="https://x.com/paulg/status/2108011311229747525">Paul Graham's follow-up posts on X</a></figcaption>
</figure>

I think that gets at why this matters. An agent can compare Amazon's delivery network with other merchants instead of treating Amazon as the default place to begin. That changes who controls discovery, recommendations, checkout initiation, and eventually the customer relationship.

## Some merchants are choosing a different model

Shopify has taken a different approach. It offers a direct Muse integration through the Muse Connector Store.

<figure>
  <picture>
    <source type="image/webp" srcset="/blog/muse-amazon-agents/muse-shopify-connector.webp">
    <img src="/blog/muse-amazon-agents/muse-shopify-connector.png" width="1604" height="1198" loading="lazy" decoding="async" alt="Muse settings on the Connectors page with Shopify selected in the search field and a Connect button beside the Shopify connector.">
  </picture>
  <figcaption>Muse's Shopify connector, as shown in the settings interface.</figcaption>
</figure>

[Shopify documents](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/meta) how eligible merchants can offer direct checkout on Meta surfaces, including Muse. Merchants can turn off Shopify Catalog access or direct checkout. If they turn off direct checkout, people can still discover products and are redirected to the merchant's own store to complete the purchase.

As Shopify puts it: "You remain the merchant of record, and you continue to manage fulfillment, returns, and customer service for these orders."

Meta also said it was adding shopping connectors for retailers including Walmart, Best Buy, American Eagle Outfitters, DICK'S Sporting Goods, Fanatics, Gap, Michael Kors, Sephora, Ulta, Wayfair, and Instacart, alongside Shop Pay and PayPal payment connectors and Expedia for travel. [Meta's Connect roundup has the full list.](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026)

Payments matter here too. [Stripe announced](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link) that Muse integrated Link's wallet for agents. Link can generate a one-time-use card so a person's real card details stay hidden, while the person still approves the purchase in Muse. [Stripe shared an example at Sessions.](https://www.linkedin.com/posts/jefftitterton_at-stripe-sessions-we-launched-links-wallet-ugcPost-7503179400813629441-AG7H/)

This is the more interesting model to me. The merchant keeps meaningful control and responsibility. The customer keeps the right to bring their own agent.

## Why Amazon might resist

Amazon has real reasons to care about consent, security, and reliability. In its [2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm), it says:

> "We seek to be Earth's most customer-centric company. We are guided by four principles: customer obsession rather than competitor focus, passion for invention, commitment to operational excellence, and long-term thinking. In each of our segments, we serve our primary customer sets, consisting of consumers, sellers, developers, enterprises, content creators, advertisers, and employees."

But Amazon's business also depends on being a place where shopping decisions happen. Its [Q2 2026 earnings release](https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-Second-Quarter-Results) describes its own shopping assistant, Alexa for Shopping, as offering personalized recommendations, product comparisons, price history, price alerts, Auto-Buy, and other shopping automation.

Amazon said active users were close to doubling and interactions were up more than five times year over year. It also said customers who use Alexa for Shopping spend, on average, more than 40% more per order than those who do not, and that customers who tried Alexa+ sign up for Prime at a nearly 25% higher rate.

The same release reported $19.809 billion in advertising-services revenue, $46.780 billion in third-party seller-services revenue, and $70.432 billion in online-stores revenue for the quarter. It also said third-party sellers accounted for 61% of worldwide paid units.

Those numbers do not prove Amazon blocked Muse to protect its existing economics. They do explain why an outside agent could be disruptive. It can move product discovery, recommendations, advertising exposure, checkout initiation, and the default shopping relationship away from Amazon's interface.

## This has happened before

I have been listening to [Acquired's episode on Google's origins](https://www.acquired.fm/episodes/google), and I keep thinking about the same conflict: should a company keep people inside the current interface, or help them reach what they came for as quickly as possible?

In 1997, Larry Page and Sergey Brin were trying to license BackRub, the search technology that became Google, to existing search engines and portals. They came close to a roughly $1 million licensing deal with Excite. The plan was for Excite to use BackRub's ranking technology, with Larry and Sergey working there over the summer to implement it.

At a final side-by-side demonstration, BackRub's results were dramatically more relevant. David Rosenthal and Ben Gilbert describe the problem this created for Excite:

> David Rosenthal: "The CEO is like, why on earth would we move to your algorithm? I want people to stay on my site. I make money when people stay on my site. I don't want them to leave my site. You guys are crazy. Get out of here. I'm killing the whole deal."
>
> Ben Gilbert: "It is amazing that as early as 1996-1997 this time period, this very important conflict of interests is teased out. This is basically why Google beat Yahoo."
>
> Ben Gilbert: "There's a lot more to it, but the portals all had this mentality of we want to build more and more and keep people on our site, in our ecosystem, continue to look at our banner ads. Google from this point, basically forever was how quickly can we deliver someone something relevant so they can leave Google and I've had a good experience finding what they really wanted?"

The point is not that Amazon is Excite or that Muse is Google. The point is that a better customer experience can conflict with the economics of the incumbent that owns the interface.

Mark Zuckerberg seems to see the same risk. On the Cheeky Pint podcast, he said:

> "And my guess is that the ones that try to block it, it will end up not being the right strategic thing for them. But we'll see. This will kind of play out over time."

In the longer exchange, Zuckerberg described browser use as a practical backstop while businesses get direct API access, and Wang said demand should shift toward agentic demand over time. [Listen to the full Cheeky Pint conversation.](https://open.spotify.com/podcast-chapter/0qLTNDAQgZBOdrmyC7BkpA?utm_source=native-share-menu)

## A path through the conflict

[Sierra's Personal Agent Protocol](https://sierra.ai/blog/introducing-personal-agent-protocol) is a useful proposal for handling this without forcing a customer agent to impersonate a human clicking through a website.

The proposed model tries to balance all three parties. Customers choose what access to grant their agent, including read-only or write access. Businesses decide which capabilities to expose and under which parameters. An agent can start as a guest, then move into an OAuth-based session when account access is needed. Companies could support the protocol through their websites, APIs, MCP, or their own agents.

It is not a finished standard. Sierra says it plans to publish the v0.1 specification, run design workshops, and release a reference implementation later this month. Still, it gives businesses a way to identify a customer's agent and set boundaries without deciding that customers cannot use agents at all.

## My take

I see Amazon blocking a customer-chosen agent from shopping as anti-consumer. It puts Amazon's control over discovery, recommendations, interface, advertising inventory, checkout initiation, and the customer relationship ahead of customers' choices. That feels in direct conflict with a company that says it seeks to be Earth's most customer-centric company.

Amazon has legitimate security concerns, and companies should be able to decide which capabilities an agent can access. But a blanket block is not the only choice. The Personal Agent Protocol shows one possible way through the conflict. Maybe Amazon is waiting for a more formal specification. I hope so.

Right now, though, this looks like a company protecting the place where shopping begins. History suggests that customers notice when a better interface is kept away from them.

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
- [Cheeky Pint: Muse Wonder: Zuckerberg and Wang's 100B AI](https://open.spotify.com/podcast-chapter/0qLTNDAQgZBOdrmyC7BkpA?utm_source=native-share-menu)
- [Sierra: Introducing Personal Agent Protocol](https://sierra.ai/blog/introducing-personal-agent-protocol)
