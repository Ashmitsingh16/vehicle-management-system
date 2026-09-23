# Location fix (v5)

Location is requested only after Update Location or Start Local Tracking. Requests use network-capable positioning with a 30-second timeout and cannot overlap. Tracking starts after a valid reading and stops after a failure; stopping/logout invalidates late callbacks. Failures appear inline without repeated red toast notifications. Accuracy is displayed without guessing the hardware source.

A manual-coordinate option accepts finite latitude/longitude in range (including zero), stops live tracking and clearly labels the point as manually entered. No coordinates are invented. Maps still require network access. Real device location depends on browser/OS permission and provider availability; use a regular browser or enter verified coordinates if the embedded browser cannot locate the device. No API key is needed for browser geolocation.

11 frontend regression tests passed, covering successful and failed location callbacks, request serialization, timer startup, stop/logout behavior, manual validation and earlier frontend fixes. Browser verification confirmed that the refreshed page opens without an unsolicited location error. Real GPS acquisition is not claimed. A versioned script URL prevents the old cached script from being reused.

All v4 changes are included. Existing production setup and live-service verification requirements in RELEASE-v4.md still apply. Backend restart restrictions from the earlier work do not prevent this frontend-only fix from appearing after reload. Kissan is unchanged.
