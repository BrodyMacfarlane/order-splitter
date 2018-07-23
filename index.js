require('dotenv').config()

const express = require('express')
    , bodyParser = require('body-parser')
    , cors = require('cors')
    , massive = require('massive')
    , xlsxj = require('xlsx-to-json')
    , converter = require('json-2-csv')
    , fs = require('fs')
    , querystring = require('querystring')
    , axios = require('axios')

const app = express()

app.use(bodyParser.json())
app.use(cors())

massive(process.env.CONNECTION_STRING).then((db) => {
  app.set('db', db)
})


// Exavault File Downloading

const username = process.env.USERNAME
const password = process.env.PASSWORD
const path = "/%2FFrom%20DirectScale%2FShipworks"
let fileUrl;

axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded'
axios.defaults.headers.post['api_key'] = 'truvision-1Ml10GFaxMJqko518quL9'

const credentials = querystring.stringify({
  "username": username,
  "password": password
});

app.post('/api/getExavault', (req, res) => {
  axios.post('https://api.exavault.com/v1/authenticateUser', credentials)
    .then(response => {
      const accessToken = response.data.results.accessToken;
      const getFilesUrl = `https://api.exavault.com/v1/getResourceList?access_token=${accessToken}&path=${path}&sortBy=sort_files_date&sortOrder=desc`
      axios.get(getFilesUrl)
        .then(response => {
          const resources = response.data.results.resources
          if(resources[0].size > resources[1].size){
            fileUrl = resources[0].path
          }
          else {
            fileUrl = resources[1].path
          }
          const getDownloadFileUrl = `https://api.exavault.com/v1/getDownloadFileUrl?access_token=${accessToken}&filePaths=${fileUrl}`
          axios.get(getDownloadFileUrl)
            .then(response => {
              const downloadLink = response.data.results.url
              let file = fs.createWriteStream("Shipworks.xlsx")
              axios.get(downloadLink, {responseType: "stream"})
                .then(response => {
                  response.data.pipe(file)
                  console.log("New shipworks file saved!")
                  res.send("goteem")
                })
            })
        })
    })
})


// File Management Section

let options = {
  delimiter : {
      wrap  : '"', // Double Quote (") character
      field : ',', // Comma field delimiter
  }
}

let intCallback = function (err, csv) {
  fs.writeFile("./tmp/International Order Export Test.csv", csv, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("International Order Export Succeeded.");
  }); 
}

let uswCallback = function (err, csv) {
  fs.writeFile("./tmp/20180769.csv", csv, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("US Warehouse Order Export Succeeded.");
  }); 
}

let nzwCallback = function (err, csv) {
  fs.writeFile("./tmp/NZW Export Test.csv", csv, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("NZW Order Export Succeeded.");
  }); 
}

app.get('/api/getOrders', (req, res) => {
  const db = app.get('db')
  db.get_SKUs().then(uglySkus => {
    let skus = []
    for(let i = 0; i < uglySkus.length; i++){
      skus.push(uglySkus[i].sku)
    }
    db.get_orders().then(uglyOrders => {
    console.log('Running...')
    let orders = []
    for(let i = 0; i < uglyOrders.length; i++){
      orders.push(uglyOrders[i].ordernumber)
    }
    xlsxj({
      input: "Shipworks.xlsx", 
      output: "output.json"
    }, function(err, result) {
      if(err) {
        console.error(err);
      }
      else {
        db.get_countries().then(countries => {
          let ordersToSend = []
          let intToSend = []
          let uswToSend = []
          let nzwToSend = []
          for(let i = 0; i < result.length; i++){
            let index = countries.map((item) => {return item.countrycode}).indexOf(result[i].SHIPCOUNTRY.toUpperCase())
            let reformedObj = {
              "Email": result[i].SHIPEMAIL,
              "Distributor ID": result[i].DISTRIBUTERID,
              "Ship-To Shipping Name": result[i].SHIPNAME,
              "Ship-To Address Line 1": result[i].SHIPADDRESS1,
              "Ship-To Address Line 2": result[i].SHIPADDRESS2,
              "Ship-To City": result[i].SHIPCITY,
              "Ship-To State Code": result[i].SHIPSTATE,
              "Ship-To Postal Code": result[i].SHIPPOSTAL,
              "Ship-To Country": result[i].SHIPCOUNTRY.toUpperCase(),
              "Telephone": result[i].SHIPPHONE,
              "Cell Phone": 0,
              "Order Date": result[i].ORDERDATETME,
              "Order Status": "Shipped",
              "Order Number": result[i].ORDERNUMBER,
              "SKU": result[i].SKU,
              "Quantity": result[i].QUANTITY,
              "Shipping Cost": 0,
              "Cost": result[i].VALUE,
              "Tax Cost": 0,
              "Total Cost": 0,
              "Shipping Method": countries[index].countryname + " Shipping",
              "Weight": result[i].WEIGHT
            }
            if(orders.indexOf(parseInt(result[i].ORDERNUMBER)) === -1){
              ordersToSend.push(reformedObj)
            }
          }
          for(let i = 0; i < ordersToSend.length; i++){
            if(ordersToSend[i]["Ship-To Country"] !== "AU" && ordersToSend[i]["Ship-To Country"] !== "NZ"){
              intToSend.push(ordersToSend[i])
            }
            else if(skus.indexOf(ordersToSend[i].SKU) > -1){
              uswToSend.push(ordersToSend[i])
            }
            else {
              nzwToSend.push(ordersToSend[i])
            }
          }
          converter.json2csv(intToSend, intCallback, options)
          converter.json2csv(nzwToSend, nzwCallback, options)
          converter.json2csv(uswToSend, uswCallback, options)
          console.log('Completed.')
          res.send('Completed.')
        })
        }
      })
    })
  })
})


const PORT = 3535
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))