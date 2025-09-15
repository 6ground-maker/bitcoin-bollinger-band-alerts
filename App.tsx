/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { fetchBitcoinHistory, fetchBitcoinPrice, calculateBollingerBands } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import { BellIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowPathIcon } from './components/icons';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [bbands, setBbands] = useState<{ upper: number, middle: number, lower: number } | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | PermissionState>('default');
  const [alerts, setAlerts] = useState<{ message: string; time: string }[]>([]);
  const [isPollingManually, setIsPollingManually] = useState(false);
  const lastAlertTime = useRef<number>(0);
  
  const COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notification');
      return;
    }
  
    // Use Permissions API for dynamic updates if available
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then((permissionStatus) => {
        setNotificationStatus(permissionStatus.state);
        permissionStatus.onchange = () => {
          setNotificationStatus(permissionStatus.state);
        };
      });
    } else {
      // Fallback for older browsers
      setNotificationStatus(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
      setError("This browser does not support desktop notification");
      return;
    }
    const permission = await Notification.requestPermission();
    // The state will be updated by the `onchange` listener if Permissions API is supported,
    // but setting it here provides a faster UI update and a fallback.
    setNotificationStatus(permission);
  };

  const handleTestNotification = () => {
    if (notificationStatus !== 'granted') {
      console.warn('Cannot send test notification, permission not granted.');
      return;
    }
  
    const title = 'Test Notification';
    const options = {
      body: 'Success! Your browser is set up to receive alerts.',
      icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👍</text></svg>',
    };
  
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: { title, options }
        });
    } else {
        new Notification(title, options);
    }
  };
  
  const pollPrice = useCallback(async () => {
    try {
      const price = await fetchBitcoinPrice();
      setPriceHistory(prevHistory => {
          const newHistory = [...prevHistory.slice(-19), price];
          const newBbands = calculateBollingerBands(newHistory);
          setBbands(newBbands);

          if (notificationStatus === 'granted' && newBbands) {
            const now = Date.now();
            if (now - lastAlertTime.current > COOLDOWN_PERIOD) {
              let alertMessage: string | null = null;
              if (price >= newBbands.upper) {
                alertMessage = `Price touched Upper Band at $${price.toLocaleString()}`;
              } else if (price <= newBbands.lower) {
                alertMessage = `Price touched Lower Band at $${price.toLocaleString()}`;
              }

              if (alertMessage) {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    // Send a message to the service worker to display the notification
                    navigator.serviceWorker.controller.postMessage({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                            title: 'Bitcoin Price Alert!',
                            options: {
                                body: alertMessage,
                                icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📈</text></svg>',
                            }
                        }
                    });
                } else {
                    // Fallback for browsers that don't support service workers or if it's not ready
                    new Notification('Bitcoin Price Alert!', {
                        body: alertMessage,
                        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📈</text></svg>',
                    });
                }
                lastAlertTime.current = now;
                setAlerts(prev => [{ message: alertMessage!, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
              }
            }
          }
          return newHistory;
      });
      setCurrentPrice(price);

    } catch (err) {
      console.error("Failed to poll price:", err);
    }
  }, [notificationStatus, COOLDOWN_PERIOD]);

  useEffect(() => {
    let intervalId: number;

    const initialize = async () => {
      try {
        if (!('Notification' in window)) {
           console.warn("Browser does not support notifications.");
        }
        setIsLoading(true);
        setError(null);
        const history = await fetchBitcoinHistory();
        setPriceHistory(history);

        const initialPrice = history.length > 0 ? history[history.length - 1] : await fetchBitcoinPrice();
        setCurrentPrice(initialPrice);
        setBbands(calculateBollingerBands(history));
        
        intervalId = window.setInterval(pollPrice, 30000);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch initial Bitcoin data.');
      } finally {
        setIsLoading(false);
      }
    };
    
    initialize();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollPrice]);
  
  const handleManualPoll = async () => {
    setIsPollingManually(true);
    await pollPrice();
    setIsPollingManually(false);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 animate-fade-in">
          <Spinner className="h-16 w-16 text-gray-300" />
          <p className="text-gray-300">Loading Bitcoin price data...</p>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
          <p className="text-md text-red-400">{error}</p>
          <button
              onClick={() => window.location.reload()}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
            >
              Reload
          </button>
        </div>
      );
    }
  
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
          <div className="w-full bg-gray-800/50 border border-gray-700/80 rounded-xl p-6 backdrop-blur-sm shadow-2xl">
              <h2 className="text-center text-sm font-medium uppercase tracking-widest text-gray-400 mb-4">Real-Time Bitcoin Price</h2>
              <p className="text-center text-6xl font-bold text-white tracking-tight mb-6">
                  ${currentPrice ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                      <h3 className="text-sm text-green-400 font-semibold">Upper Band</h3>
                      <p className="text-xl text-gray-200">${bbands ? bbands.upper.toLocaleString(undefined, {minimumFractionDigits: 2}) : '...'}</p>
                  </div>
                  <div>
                      <h3 className="text-sm text-gray-400 font-semibold">20-Hour SMA</h3>
                      <p className="text-xl text-gray-200">${bbands ? bbands.middle.toLocaleString(undefined, {minimumFractionDigits: 2}) : '...'}</p>
                  </div>
                  <div>
                      <h3 className="text-sm text-red-400 font-semibold">Lower Band</h3>
                      <p className="text-xl text-gray-200">${bbands ? bbands.lower.toLocaleString(undefined, {minimumFractionDigits: 2}) : '...'}</p>
                  </div>
              </div>

              <div className="mt-6 border-t border-gray-700/80 pt-4">
                  <button
                      onClick={handleManualPoll}
                      disabled={isPollingManually}
                      className="w-full flex items-center justify-center gap-2 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isPollingManually ? (
                          <>
                              <Spinner className="h-5 w-5" />
                              <span>Checking...</span>
                          </>
                      ) : (
                          <>
                              <ArrowPathIcon className="w-5 h-5"/>
                              <span>Check Price Now</span>
                          </>
                      )}
                  </button>
              </div>
          </div>
          
          <div className="w-full bg-gray-800/50 border border-gray-700/80 rounded-xl p-6 backdrop-blur-sm shadow-2xl flex flex-col items-center">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">Push Notifications</h2>
              {notificationStatus !== 'granted' ? (
                   <button onClick={handleRequestPermission} className="flex items-center gap-3 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95">
                      <BellIcon className="w-6 h-6"/>
                      Enable Notifications
                   </button>
               ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircleIcon className="w-6 h-6"/>
                        <p className="font-semibold">Notifications are active.</p>
                    </div>
                    <button 
                         onClick={handleTestNotification}
                         className="bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                     >
                         Send Test Notification
                     </button>
                  </div>
               )}
                {notificationStatus === 'denied' && <p className="text-sm text-yellow-400 mt-3 text-center">You've blocked notifications. Please enable them in your browser settings.</p>}
          </div>
  
          <div className="w-full bg-gray-800/50 border border-gray-700/80 rounded-xl p-6 backdrop-blur-sm shadow-2xl">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">Recent Alerts</h2>
              {alerts.length > 0 ? (
                  <ul className="space-y-3">
                      {alerts.map((alert, index) => (
                          <li key={index} className="flex items-center gap-3 text-sm animate-fade-in">
                              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                              <span className="text-gray-300">{alert.message}</span>
                              <span className="ml-auto text-gray-500">{alert.time}</span>
                          </li>
                      ))}
                  </ul>
              ) : (
                  <p className="text-center text-gray-500">No alerts triggered yet. Waiting for price to touch a band...</p>
              )}
          </div>
  
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className="flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center items-center">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;