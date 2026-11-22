# Attendance, office Wi-Fi lock and reception QR

## What staff do

1. Be on the office Wi-Fi.
2. Scan the reception QR, either inside SWK OS (Attendance Check-In) or with the phone's normal camera. The QR holds a link, so a normal camera opens SWK OS at the sign-in step.
3. Sign in with their own email and password (and authenticator code if enabled). The page says "Code read. Sign in within 90 seconds."
4. The check-in time shows in Attendance in Dubai time.

On a person's first use, the phone registers a device key. One phone belongs to one person, and one phone can check in only one person per day. A new phone needs approval by management.

## Rules the server enforces

- The request must come from the locked office network.
- The code must be valid: a fixed code, or a code that rotates every 30 seconds.
- The phone proves its identity with its own device key.
- The person signs in with their own password. Staff who still have a temporary password must change it first.
- Check-in attempts are rate limited per network address.
- Times are stored in Dubai time. 10:05 AM is the on-time limit.

## Office Wi-Fi lock (Admin only)

Settings, **Attendance Wi-Fi** (visible only to the Admin):

- **Lock once:** open Settings from a device on the office Wi-Fi and press "Lock this network as the office". Until this is done nobody can check in.
- **Change it:** press "Clear to change the network", then lock again from the new network. A second lock without clearing is refused.
- Only the Admin can lock, clear or change it. The Owner and the Manager cannot, and saving other settings never changes it.

## Reception code and QR

- The reception code screen is `/reception-display`. It opens only for the Owner, Admin and Haseeb, and only from the office network once it is locked.
- **Fixed mode (default):** one code that stays the same, suitable for a printed poster. **Rotating mode:** a new code every 30 seconds for a screen.
- **Regenerate** makes every printed fixed code useless. Use it after a leak, then reprint.
- The QR content is `https://os.swk.properties/reception-qr#c=<code>`. Do not commit a printed poster or the code to the repository.

## Reports

A 09:30 AM briefing and a 10:30 AM attendance report (on time, late, absent) go to the Owner by WhatsApp when WhatsApp is connected. Three late arrivals in seven days raise an alert.
