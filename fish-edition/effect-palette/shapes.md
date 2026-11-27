# Coordinate system

## Screen space (default)

+X: Right
+Y: Up
+Z: Out of the screen (toward camera)

0 degrees: +X
+degrees: counterclockwise

## Aim

Same as screen space, except rotated so +X points in the direction of aim.

For the case of operator to target, this means +X is away from the operator and toward the target.

## World space

Changes +Y and +Z so +Y means toward the top of the battlefield, and +Z means higher altitude where flying units are.

# Places

Most effects specify a point A and B, or a point A and aim direction.

Origin: Usually the operator.

Target: Usually the thing being attacked.

Sky: Directly above (+Y) of wherever the other place being specified is. (ex. Sky to Target, or Sky to Origin) Needs to be high enough to appear to be offscreen. Probably 10t is enough.

# Timing

Most effects are attached to an attack, so the attack determines the start and duration, and they don't last after the attack.

Some effects are long lasting such as a status effect or lasting for a skill duration.

# Units

1t = 1 tile.

# Shapes

Can apply to any shape:

- Color: 1 or more hex codes colourpicked from the original effects. First color is the most prominent. Colours should be blended and all used (random per particle, including interpolations between key colors).
- Bright: Enables glow effect.
- Thickness: Adjust thickness by a multiple.
- Scale: Adjust overall scaling by a multiple.
- Transparency: Make less opaque. Most shapes are opaque by default.
- Layer: On top of all units by default.

## Beam

A thin rectangle (0.05t x X) that extends all the way from A to B. No blur or glow.

## Bullet

A plain rectangle, thin and long (0.05t x X), that moves linearly from A to B. No blur or glow.

Firework trait:

- 0%: None.
- 100%: Produces glowing particles behind it forming a trail, lasting long enough that the particles near A are still present when the bullet reaches B.
- X%: Particle lifetime is adjusted so the trail overall is X% of the length from A to B.

Mostly used for ranged basic attacks. For instantaneous hit attacks with no hit delay, use a minimum duration of 0.15s.

## Mortar

A circle that arcs (+Y) from A to B. No blur or glow. Circle default radius is 0.05t.

Firework trait: as in Bullet.
Height trait: 100% means the peak of the arc has +Y offset equal to the X distance from A to B. Default: 25%.
Magic trait: default off. If on, follows a random cubic bezier instead of a predictable arc.

Mostly used for ranged basic attacks.

## Splash

A short lived (0.5s) particle system. Originates from a point A with an Aim direction. Particles move outward from A, in the general direction of Aim. Particles use thin long rectangles similar to Bullet. Default extent is 0.5t.

Spread trait: Controls how far to the left or right the particles will fly. 45 degrees means up to 45 degrees left or 45 degrees right, so overall a 90 degree cone.
Full circle trait: Special case of uniform distribution in all angles.
Reverse trait: Points in the reverse direction of Aim.

## Moon

A segment of a circle, surrounding point A. Entire segment is visible at the same time. Default radius is 0.5t, and thickness is 0.15t.

Arc motion trait: Starts at X degrees, fills toward Y degrees.
Linear motion trait: Moves in the specified direction.
Scale motion trait: Getting larger (+) or smaller (-).
Whirlpool trait: Composed of many smaller arcs that are bent so the clockwise side is closer to the center. Arcs move in a spiral toward the center. Arcs spawn and fade in with larger scale and fade out with smaller scale.

Mostly used for shields (no motion) or sword swings (with motion). Full circle is a rare case.

## Rain

A particle system of thin but tall rectangles (0.025t x 0.25t), moving downward (5t/s), in an area around point A.

Upward trait: Changes direction to be upward.

Bend trait:

- 0 - Default.
- +1 - Convex. Outer raindrops trace a circle.
- -1 - Concave. Outer raindrops are furthest on X axis when at the top or bottom, and closest to X middle when Y is in the middle.

Mostly used for buffs, moving upward.

## Orb

A small filled circle. Default radius is 0.05t.

## Lightning

Like beam, but it's a randomized multiline. (default thickness: 0.05t) Per instance, only randomizes once and stays in whatever shape it is until it despawns.

Jitter trait: Maximum deviation of main spine points around the line from A to B. Default 0.5t.
Segments trait: default 10.
Branches trait: default off. If enabled, allows up to this many branches off the main multiline.

## Star

A shape with some random spikes radiating from the center. You can make this by taking a N-gon (N=20) and randomly scaling each vertex relative to the center. A different algorithm can be used if you want to ensure a minimum spacing between spokes, or to make the concave section between spokes smoother. 5 to 7 spokes is ideal.

Default outer radius is 0.25t and inner radius is 0.05t.

## Fence

Traces a specific rectilinear area. Often used for skills. Fill and outline should be specified separately. Default outline thickness is 0.05t.

## Cut

A rectangular ribbon (0.1t x 0.5t) that follows a linear path (-0.5t to 0.5t), crossing over point A, in the direction of Aim. Fades from transparent to colour to transparent along the length of the ribbon.

Used for some attacks and not quite the same as Bullet or Moon.
