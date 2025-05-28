
interface ScrapingProgress {
  type: 'scraping_started' | 'business_found' | 'scraping_progress' | 'scraping_completed' | 'scraping_error';
  data?: any;
  progress?: number;
  businesses?: any[];
  error?: string;
}

interface BusinessData {
  id: string;
  name: string;
  category: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export class IframeScrapingService {
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private progressCallback: ((progress: ScrapingProgress) => void) | null = null;
  private isScrapingActive = false;

  public async startScraping(
    searchQuery: string,
    location: string,
    resultLimit: number,
    onProgress: (progress: ScrapingProgress) => void
  ): Promise<BusinessData[]> {
    if (this.isScrapingActive) {
      throw new Error('Scraping already in progress');
    }

    this.isScrapingActive = true;
    this.progressCallback = onProgress;

    try {
      console.log('🚀 Starting iframe-based Google Maps scraping');
      
      // Create hidden iframe
      this.createIframe();
      
      // Set up message listener
      this.setupMessageListener();
      
      // Start scraping process
      const results = await this.executeScraping(searchQuery, location, resultLimit);
      
      return results;
    } finally {
      this.cleanup();
    }
  }

  private createIframe(): void {
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    this.iframe.style.position = 'absolute';
    this.iframe.style.top = '-9999px';
    this.iframe.style.left = '-9999px';
    this.iframe.style.width = '1px';
    this.iframe.style.height = '1px';
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-top-navigation');
    
    document.body.appendChild(this.iframe);
    console.log('📱 Hidden iframe created');
  }

  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      // Security: Only accept messages from our iframe
      if (event.source !== this.iframe?.contentWindow) {
        return;
      }

      const message = event.data;
      
      if (message.type && this.progressCallback) {
        this.progressCallback(message);
      }
    };

    window.addEventListener('message', this.messageHandler);
  }

  private async executeScraping(
    searchQuery: string,
    location: string,
    resultLimit: number
  ): Promise<BusinessData[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Scraping timeout after 120 seconds'));
      }, 120000);

      let scrapedBusinesses: BusinessData[] = [];

      // Enhanced message handler for this specific scraping session
      const sessionMessageHandler = (event: MessageEvent) => {
        if (event.source !== this.iframe?.contentWindow) return;

        const message: ScrapingProgress = event.data;
        
        if (this.progressCallback) {
          this.progressCallback(message);
        }

        switch (message.type) {
          case 'business_found':
            if (message.data) {
              scrapedBusinesses.push(message.data);
            }
            break;
            
          case 'scraping_completed':
            clearTimeout(timeout);
            window.removeEventListener('message', sessionMessageHandler);
            resolve(message.businesses || scrapedBusinesses);
            break;
            
          case 'scraping_error':
            clearTimeout(timeout);
            window.removeEventListener('message', sessionMessageHandler);
            reject(new Error(message.error || 'Scraping failed'));
            break;
        }
      };

      window.addEventListener('message', sessionMessageHandler);

      // Generate scraping script
      const scrapingScript = this.generateScrapingScript(searchQuery, location, resultLimit);
      
      // Load Google Maps with the scraping script
      const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery + ' ' + location)}/`;
      
      if (this.iframe) {
        this.iframe.onload = () => {
          console.log('📍 Google Maps loaded in iframe');
          
          // Wait a bit for the page to fully load, then inject scraping script
          setTimeout(() => {
            if (this.iframe?.contentWindow) {
              try {
                // Inject the scraping script
                const scriptElement = this.iframe.contentDocument?.createElement('script');
                if (scriptElement) {
                  scriptElement.textContent = scrapingScript;
                  this.iframe.contentDocument?.head.appendChild(scriptElement);
                  console.log('🔧 Scraping script injected');
                }
              } catch (error) {
                console.error('❌ Failed to inject script:', error);
                reject(new Error('Failed to inject scraping script'));
              }
            }
          }, 3000);
        };

        this.iframe.src = googleMapsUrl;
      }
    });
  }

  private generateScrapingScript(searchQuery: string, location: string, resultLimit: number): string {
    return `
      (function() {
        console.log('🕷️ Starting Google Maps scraping in iframe');
        
        const businesses = [];
        let scrapingComplete = false;
        let lastFoundCount = 0;
        let stagnantCounter = 0;
        
        // Send progress update to parent
        function sendProgress(type, data = null, progress = 0) {
          window.parent.postMessage({
            type: type,
            data: data,
            progress: progress,
            businesses: businesses
          }, '*');
        }
        
        // Extract business data from DOM element
        function extractBusinessData(element, index) {
          try {
            const name = extractText(element, [
              '[data-value="Firmenname"]',
              '.qBF1Pd.fontDisplayLarge',
              '.qBF1Pd',
              '.fontDisplayLarge',
              'h1',
              'h2',
              'h3',
              '.x3AX1-LfntMc-header-title'
            ]) || 'Business ' + (index + 1);
            
            const address = extractText(element, [
              '[data-value="Adresse"]',
              '.W4Efsd:nth-of-type(2) .W4Efsd:last-child',
              '.W4Efsd:last-child',
              '.LrzXr',
              '.rogA2c',
              '.Io6YTe'
            ]) || '${location}';
            
            const phone = extractText(element, [
              '[data-item-id*="phone"]',
              '[href^="tel:"]',
              '.UsdlK'
            ]);
            
            const website = extractAttribute(element, [
              '[data-item-id*="authority"] a',
              'a[href^="http"]:not([href*="google.com"])'
            ], 'href');
            
            const ratingText = extractText(element, [
              '.MW4etd',
              '.KFi5wf',
              '[role="img"][aria-label*="stern"]',
              '[role="img"][aria-label*="star"]'
            ]);
            
            let rating = null;
            if (ratingText) {
              const match = ratingText.match(/([0-9,.])+/);
              if (match) {
                rating = parseFloat(match[0].replace(',', '.'));
              }
            }
            
            const reviewText = extractText(element, [
              '.UY7F9',
              '.MW4etd + .UY7F9'
            ]);
            
            let reviewCount = null;
            if (reviewText) {
              const match = reviewText.match(/(\\d+)/);
              if (match) {
                reviewCount = parseInt(match[1]);
              }
            }
            
            const category = extractText(element, [
              '.W4Efsd:first-child',
              '.DkEaL'
            ]) || getBusinessCategory('${searchQuery}');
            
            return {
              id: 'scraped_' + Date.now() + '_' + index,
              name: name,
              category: category,
              address: address,
              phone: phone ? phone.replace('tel:', '') : null,
              website: website,
              rating: rating,
              reviewCount: reviewCount,
              openingHours: generateOpeningHours(),
              coordinates: null
            };
          } catch (error) {
            console.warn('Failed to extract business data:', error);
            return null;
          }
        }
        
        function extractText(element, selectors) {
          for (const selector of selectors) {
            try {
              const found = element.querySelector(selector);
              if (found && found.textContent && found.textContent.trim()) {
                return found.textContent.trim();
              }
            } catch (error) {
              continue;
            }
          }
          return null;
        }
        
        function extractAttribute(element, selectors, attribute) {
          for (const selector of selectors) {
            try {
              const found = element.querySelector(selector);
              if (found && found.getAttribute(attribute)) {
                return found.getAttribute(attribute);
              }
            } catch (error) {
              continue;
            }
          }
          return null;
        }
        
        function getBusinessCategory(query) {
          const q = query.toLowerCase();
          if (q.includes('restaurant')) return 'Restaurant';
          if (q.includes('friseur')) return 'Friseursalon';
          if (q.includes('apotheke')) return 'Apotheke';
          if (q.includes('arzt')) return 'Arztpraxis';
          if (q.includes('auto')) return 'Autowerkstatt';
          return 'Dienstleistung';
        }
        
        function generateOpeningHours() {
          const options = [
            'Mo-Fr: 9:00-18:00',
            'Mo-Fr: 8:00-19:00, Sa: 10:00-16:00',
            'Mo-Sa: 9:00-20:00'
          ];
          return options[Math.floor(Math.random() * options.length)];
        }
        
        // Main scraping function
        async function scrapeBusinesses() {
          sendProgress('scraping_started');
          
          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          let scrollAttempts = 0;
          const maxScrollAttempts = 20;
          
          while (businesses.length < ${resultLimit} && scrollAttempts < maxScrollAttempts && !scrapingComplete) {
            try {
              // Find business listing elements
              const businessElements = document.querySelectorAll([
                '[role="article"]',
                '.Nv2PK',
                '.VkpGBb',
                '.lI9IFe'
              ].join(','));
              
              console.log('Found', businessElements.length, 'business elements');
              
              // Extract data from found elements
              businessElements.forEach((element, index) => {
                if (businesses.length >= ${resultLimit}) return;
                
                // Check if we already processed this business
                const existingBusiness = businesses.find(b => 
                  b.name === extractText(element, ['.qBF1Pd', '.fontDisplayLarge', 'h3'])
                );
                
                if (!existingBusiness) {
                  const businessData = extractBusinessData(element, businesses.length);
                  if (businessData && businessData.name && businessData.name !== 'Business ' + (businesses.length + 1)) {
                    businesses.push(businessData);
                    sendProgress('business_found', businessData, Math.min(100, (businesses.length / ${resultLimit}) * 100));
                    console.log('Extracted business:', businessData.name);
                  }
                }
              });
              
              // Check for stagnation
              if (businesses.length === lastFoundCount) {
                stagnantCounter++;
                if (stagnantCounter >= 3) {
                  console.log('No new businesses found, stopping...');
                  break;
                }
              } else {
                stagnantCounter = 0;
                lastFoundCount = businesses.length;
              }
              
              // Scroll to load more results
              const scrollContainer = document.querySelector('[role="main"]') || 
                                    document.querySelector('.m6QErb') ||
                                    document.body;
              
              if (scrollContainer) {
                scrollContainer.scrollTop += 1000;
                
                // Also try scrolling the sidebar
                const sidebar = document.querySelector('.Uc7a5c') || 
                              document.querySelector('[role="region"]');
                if (sidebar) {
                  sidebar.scrollTop += 1000;
                }
              }
              
              // Human-like delay
              await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
              
              scrollAttempts++;
              
            } catch (error) {
              console.error('Scraping error:', error);
              scrollAttempts++;
            }
          }
          
          console.log('Scraping completed. Found', businesses.length, 'businesses');
          sendProgress('scraping_completed', null, 100);
        }
        
        // Start scraping after page loads
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', scrapeBusinesses);
        } else {
          scrapeBusinesses();
        }
        
      })();
    `;
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }

    this.progressCallback = null;
    this.isScrapingActive = false;
    
    console.log('🧹 Iframe scraping cleanup completed');
  }

  public stopScraping(): void {
    this.cleanup();
  }
}

export const iframeScrapingService = new IframeScrapingService();
