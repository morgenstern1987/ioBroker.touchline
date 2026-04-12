const utils = require("@iobroker/adapter-core");
const TouchlineClient = require("./lib/touchline");

class TouchlineAdapter extends utils.Adapter {

    constructor(options = {}) {
        super({
            ...options,
            name: "touchline"
        });

        this.client = null;

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
    }

    async onReady() {

        this.log.info("Touchline adapter started");

        this.client = new TouchlineClient(this.config.ip);

        await this.setObjectNotExistsAsync("info.connection", {
            type: "state",
            common: {
                name: "Connection",
                type: "boolean",
                role: "indicator.connected",
                read: true,
                write: false
            },
            native: {}
        });

        this.poll();

        setInterval(() => {
            this.poll();
        }, this.config.interval * 1000);

    }

    async poll(){

        try{

            const zones = await this.client.getZones();

            for(const z of zones){

                const base = "rooms."+z.id;

                await this.setObjectNotExistsAsync(base,{
                    type:"channel",
                    common:{name:z.name},
                    native:{}
                });

                await this.setObjectNotExistsAsync(base+".temperature",{
                    type:"state",
                    common:{
                        name:"Temperature",
                        type:"number",
                        role:"value.temperature",
                        unit:"°C",
                        read:true,
                        write:false
                    },
                    native:{}
                });

                await this.setStateAsync(
                    base+".temperature",
                    {val:z.temperature,ack:true}
                );

            }

            this.setState("info.connection",true,true);

        }catch(e){

            this.log.error(e);
            this.setState("info.connection",false,true);

        }

    }

    async onStateChange(id,state){

        if(!state || state.ack) return;

        if(id.includes("setpoint")){

            const parts=id.split(".");
            const zone=parts[3];

            await this.client.setTemp(zone,state.val);

        }

    }

}

if(module.parent){
    module.exports=(options)=>new TouchlineAdapter(options);
}else{
    new TouchlineAdapter();
}
