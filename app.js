const { createApp } = Vue

createApp({
    data() {
        return {
            masterRanks: [],
            serverDailyData: [],
            userInputs: [
                { minnaPower: 0, jibunPower: 161.7 }, // 月
                { minnaPower: 0, jibunPower: 267.6 }, // 火
                { minnaPower: 0, jibunPower: 400 },   // 水
                { minnaPower: 0, jibunPower: 400 },   // 木
                { minnaPower: 0, jibunPower: 400 },   // 金
                { minnaPower: 0, jibunPower: 400 },   // 土
                { minnaPower: 0, jibunPower: 400 }    // 日
            ],
            isLoaded: false
        }
    },
    computed: {
        // 全計算を順番に行う（C列、B列の算出）
        calculatedDailyData() {
            if (!this.isLoaded) return [];

            let cumulativePower = 0;
            let results = [];

            for (let i = 0; i < this.serverDailyData.length; i++) {
                const serverDay = this.serverDailyData[i];
                const userIn = this.userInputs[i];
                
                // D列: 制作者がisFixedをtrueにしていれば強制的にそれを使用。そうでなければユーザー入力を優先
                let minna = serverDay.isFixed ? serverDay.fixedMinnaPower : userIn.minnaPower;
                // E列: 常にユーザー入力を優先
                let jibun = userIn.jibunPower || 0;
                
                // C列: イベントねむけパワー = みんな + じぶん
                let dayEventPower = minna + jibun;
                cumulativePower += dayEventPower;

                // B列: 累計パワーから現在の到達ランクを計算
                let reachedRank = 1;
                for (let r = this.masterRanks.length - 1; r >= 0; r--) {
                    if (cumulativePower >= this.masterRanks[r].requiredPower) {
                        reachedRank = this.masterRanks[r].rank;
                        break;
                    }
                }

                results.push({
                    day: serverDay.day,
                    isFixed: serverDay.isFixed,
                    minnaPower: minna,
                    jibunPower: jibun,
                    eventPower: cumulativePower, // 累計値を表示（単日表示にする場合は dayEventPower に変更）
                    reachedRank: reachedRank
                });
            }
            return results;
        },
        totalEventPower() {
            if (this.calculatedDailyData.length === 0) return 0;
            return this.calculatedDailyData[this.calculatedDailyData.length - 1].eventPower;
        },
        currentRank() {
            if (this.calculatedDailyData.length === 0) return { rank: 1 };
            return { rank: this.calculatedDailyData[this.calculatedDailyData.length - 1].reachedRank };
        },
        nextRank() {
            const currentRankNum = this.currentRank.rank;
            return this.masterRanks.find(r => r.rank === currentRankNum + 1) || null;
        },
        progressPercentage() {
            if (!this.nextRank) return 100;
            const currentRankDef = this.masterRanks.find(r => r.rank === this.currentRank.rank);
            const basePower = currentRankDef ? currentRankDef.requiredPower : 0;
            
            const powerNeededForNext = this.nextRank.requiredPower - basePower;
            const currentProgress = this.totalEventPower - basePower;
            
            let percent = (currentProgress / powerNeededForNext) * 100;
            return Math.min(Math.max(percent, 0), 100);
        }
    },
    methods: {
        async loadData() {
            try {
                // 制作者が更新する data.json を読み込む（キャッシュを防ぐためにクエリパラメータ付与）
                const response = await fetch(`data.json?t=${new Date().getTime()}`);
                const data = await response.json();
                this.masterRanks = data.masterRanks;
                this.serverDailyData = data.dailyData;

                // ユーザーの過去の入力をローカルストレージから復元
                const saved = localStorage.getItem('mewtwo_sleep_calc_data');
                if (saved) {
                    const parsedSaved = JSON.parse(saved);
                    // サーバーからの配列長と合う場合のみ復元
                    if(parsedSaved.length === this.userInputs.length){
                         this.userInputs = parsedSaved;
                    }
                } else {
                    // 初期値設定（D列の初期値をJSONからコピー）
                    for(let i=0; i<this.serverDailyData.length; i++){
                        if(!this.serverDailyData[i].isFixed){
                            this.userInputs[i].minnaPower = this.serverDailyData[i].fixedMinnaPower || 0;
                        }
                    }
                }
                this.isLoaded = true;
            } catch (error) {
                console.error("データの読み込みに失敗しました:", error);
                alert("データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
            }
        },
        saveToLocal() {
            // 利用者が値を入力した際、ローカルストレージに自動保存
            localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
        },
        // ランクに応じた色分けクラスを返すロジック
        getRankColorClass(rank) {
            if (rank <= 5) return 'text-rank-low';
            if (rank <= 10) return 'text-rank-mid';
            return 'text-rank-high';
        },
        getRankBgClass(rank) {
            if (rank <= 5) return 'bg-rank-low';
            if (rank <= 10) return 'bg-rank-mid';
            return 'bg-rank-high';
        },
        getProgressBarColor(nextRank) {
            if (nextRank <= 5) return '#3b82f6';
            if (nextRank <= 10) return '#a855f7';
            return '#ec4899';
        }
    },
    mounted() {
        this.loadData();
    }
}).mount('#app')