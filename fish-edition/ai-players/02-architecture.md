# Architecture decisions/suggestions

Correct me if I'm wrong, since everything to follow is contingent on this assumption.

**Many tests depend on the bot behaviour. Therefore, we cannot just change the bot behaviour.**

So the obvious answer to this is to keep the existing "dumb" bot, and introduce a separate "smart" bot, where we are so far free to make changes.

# A layered strategy

As described in https://github.com/evenifyouforget/Stronghold-Protocol-EN/issues/36 - as a start, the smart bot could be functionally the same as the dumb bot but built with a series of strategies.

This naturally opens the door for evolutionary algorithms and mass programmatic testing of bot strategies. An evolution/benchmark run could be started in the background, and it would be relatively token-efficient as it does not need constant monitoring.

From there, we can try adding new sub-strategies and see if it those sub-strategies end up in the winning configurations.

Before making DYYBot and others, we should make a layered tactics version of the current classical bot to compare as a baseline. We expect that the layered tactics version achieves the same or better performance, and possibly slightly better performance after auto-tuning.
