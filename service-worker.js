/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Service worker for handling push notifications.

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // Activate the new service worker as soon as it's installed.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated.');
  // Take control of all open clients immediately.
  event.waitUntil(self.clients.claim());
});

// The main app sends a message to this service worker to display a notification.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data.payload;
    // The service worker shows the notification on behalf of the app.
    // This makes notifications more reliable, especially if the app tab is not in focus.
    event.waitUntil(self.registration.showNotification(title, options));
  }
});
