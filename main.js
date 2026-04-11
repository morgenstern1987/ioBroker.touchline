const utils = require("@iobroker/adapter-core");
const Touchline = require("./lib/touchline");

class TouchlineAdapter extends utils.Adapter {

    constructor(options){
        super({...options,name:"touchline"});
    }

    async onReady(){

        this.client = new Touchline(this.config.ip);

        this.poll();

        setInterval(()=>{
            this.poll();
        },this.config.interval*1000);

    }

    async poll(){

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

    }

}

if(module.parent){
    module.exports=(options)=>new TouchlineAdapter(options);
}else{
    new TouchlineAdapter();
}