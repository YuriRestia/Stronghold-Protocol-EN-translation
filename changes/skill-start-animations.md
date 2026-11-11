## 2026-11-11

### A skill with a start animation plays it in full before the skill begins

- When an operator casts a skill that opens with a start animation, the animation now plays to its end before the skill takes effect, as in the official game, and the operator's attacks wait for it. This covers 138 skills of 91 operators, such as Mizuki S3, Ayerscarpe S2 and Gavial the Invincible S2; the start animations last 0.1 to 1.5 s.
- Being stunned, frozen or put to sleep during the animation cancels the cast and keeps the skill points.
- Before: the skill took effect at once, and the first attack cut its start animation off.
- Skills without a start animation, such as Mostima S3, are unchanged. This changes battle results a little; the stored test results (goldens) are regenerated with it.
