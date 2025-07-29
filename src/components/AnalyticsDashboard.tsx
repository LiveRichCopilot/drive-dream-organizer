import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  TrendingUp, 
  Camera, 
  Zap, 
  Clock, 
  Search, 
  Users,
  Activity,
  Download,
  Target,
  RefreshCw
} from "lucide-react";

interface AnalyticsData {
  photosOrganized: number;
  promptsGenerated: number;
  averageProcessingTime: number;
  topCategories: Array<{ name: string; count: number; percentage: number }>;
  searchTerms: Array<{ term: string; count: number }>;
  processingTimes: Array<{ date: string; time: number }>;
  userRetention: number;
  errorRate: number;
  totalSessions: number;
  batchesProcessed: number;
}

interface AnalyticsDashboardProps {
  onEvent?: (event: string, data: any) => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onEvent }) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    photosOrganized: 1247,
    promptsGenerated: 89,
    averageProcessingTime: 3.2,
    topCategories: [
      { name: "Bikini/Swimwear", count: 423, percentage: 34 },
      { name: "Evening Wear", count: 287, percentage: 23 },
      { name: "Casual Outfits", count: 198, percentage: 16 },
      { name: "Beach/Vacation", count: 156, percentage: 12 },
      { name: "Professional", count: 108, percentage: 9 },
      { name: "Other", count: 75, percentage: 6 }
    ],
    searchTerms: [
      { term: "golden hour", count: 45 },
      { term: "beach", count: 32 },
      { term: "black dress", count: 28 },
      { term: "sunset", count: 24 },
      { term: "bikini", count: 21 }
    ],
    processingTimes: [],
    userRetention: 78,
    errorRate: 2.1,
    totalSessions: 342,
    batchesProcessed: 156
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Track dashboard view
    onEvent?.('analytics_dashboard_viewed', {
      timestamp: Date.now(),
      photos_organized: analyticsData.photosOrganized
    });
  }, [onEvent, analyticsData.photosOrganized]);

  const refreshData = async () => {
    setIsRefreshing(true);
    
    // Simulate data refresh
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Update with slight variations to simulate real data
    setAnalyticsData(prev => ({
      ...prev,
      photosOrganized: prev.photosOrganized + Math.floor(Math.random() * 20),
      promptsGenerated: prev.promptsGenerated + Math.floor(Math.random() * 5),
      averageProcessingTime: Math.max(2.0, prev.averageProcessingTime + (Math.random() - 0.5) * 0.5),
      totalSessions: prev.totalSessions + Math.floor(Math.random() * 10)
    }));
    
    setIsRefreshing(false);
    
    onEvent?.('analytics_refreshed', {
      timestamp: Date.now(),
      refresh_duration: 1500
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">Analytics Dashboard</h2>
          <p className="text-white/70">Real-time insights into your photo organization workflow</p>
        </div>
        
        <Button
          onClick={refreshData}
          disabled={isRefreshing}
          variant="glass"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">Photos Organized</p>
              <p className="text-2xl font-bold text-white">{analyticsData.photosOrganized.toLocaleString()}</p>
              <Badge variant="outline" className="mt-2 bg-green-500/20 border-green-400/30 text-green-300">
                <TrendingUp className="w-3 h-3 mr-1" />
                +12% this week
              </Badge>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-500/15 backdrop-blur-xl flex items-center justify-center border border-blue-400/40">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">Prompts Generated</p>
              <p className="text-2xl font-bold text-white">{analyticsData.promptsGenerated}</p>
              <Badge variant="outline" className="mt-2 bg-purple-500/20 border-purple-400/30 text-purple-300">
                <Zap className="w-3 h-3 mr-1" />
                89% copy rate
              </Badge>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/15 backdrop-blur-xl flex items-center justify-center border border-purple-400/40">
              <Zap className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">Avg Processing Time</p>
              <p className="text-2xl font-bold text-white">{analyticsData.averageProcessingTime.toFixed(1)}s</p>
              <Badge variant="outline" className="mt-2 bg-orange-500/20 border-orange-400/30 text-orange-300">
                <Clock className="w-3 h-3 mr-1" />
                -0.3s improved
              </Badge>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500/30 to-red-500/15 backdrop-blur-xl flex items-center justify-center border border-orange-400/40">
              <Clock className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">Total Sessions</p>
              <p className="text-2xl font-bold text-white">{analyticsData.totalSessions}</p>
              <Badge variant="outline" className="mt-2 bg-cyan-500/20 border-cyan-400/30 text-cyan-300">
                <Users className="w-3 h-3 mr-1" />
                {analyticsData.userRetention}% retention
              </Badge>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/15 backdrop-blur-xl flex items-center justify-center border border-cyan-400/40">
              <Activity className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Categories and Search Terms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500/30 to-purple-500/15 backdrop-blur-xl flex items-center justify-center border border-pink-400/40">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">Most Used Categories</h3>
              <p className="text-white/70 text-sm">Based on organization patterns</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {analyticsData.topCategories.map((category, index) => (
              <div key={category.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-white font-medium">{category.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-white/10 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full"
                      style={{ width: `${category.percentage}%` }}
                    />
                  </div>
                  <span className="text-white/70 text-sm min-w-[3rem]">{category.count}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Popular Search Terms */}
        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-500/15 backdrop-blur-xl flex items-center justify-center border border-green-400/40">
              <Search className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">Popular Search Terms</h3>
              <p className="text-white/70 text-sm">What users search for most</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {analyticsData.searchTerms.map((term, index) => (
              <div key={term.term} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-white font-medium">"{term.term}"</span>
                </div>
                <Badge variant="outline" className="bg-green-500/20 border-green-400/30 text-green-300">
                  {term.count} searches
                </Badge>
              </div>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Total searches this week</span>
              <span className="text-white font-semibold">
                {analyticsData.searchTerms.reduce((sum, term) => sum + term.count, 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-4">
            <Target className="h-5 w-5 text-green-400" />
            <h3 className="font-semibold text-white">Success Rate</h3>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{(100 - analyticsData.errorRate).toFixed(1)}%</div>
            <p className="text-white/70 text-sm mt-1">Processing success rate</p>
          </div>
        </Card>

        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-4">
            <Download className="h-5 w-5 text-blue-400" />
            <h3 className="font-semibold text-white">Batches Processed</h3>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{analyticsData.batchesProcessed}</div>
            <p className="text-white/70 text-sm mt-1">This month</p>
          </div>
        </Card>

        <Card className="liquid-glass-card p-6 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-5 w-5 text-purple-400" />
            <h3 className="font-semibold text-white">User Retention</h3>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{analyticsData.userRetention}%</div>
            <p className="text-white/70 text-sm mt-1">7-day retention rate</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;