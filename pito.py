import math
# Long scale vigintillion is 10^120
vigintillion_long = 10**120

# 1 cd uniformly in all directions = 4 * pi / 683 Watts
# Total power for 10^120 cd:
power = (4 * math.pi / 683) * vigintillion_long
# For 1 second, Energy in Joules is equal to power
print(f"{power:.3e}")