const express = require('express')
const morgan = require('morgan')
const ejs = require('ejs')
const path = require('path')
const mainRoute = require('./router/main.js')
require('dotenv').config()

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.json())
app.use(express.urlencoded({extended: false}))
app.use(morgan('dev'))
app.use('/static', express.static(path.join(__dirname, 'static')))
app.use(mainRoute)

app.listen(3000)
console.log("Escuchando en el puerto 3000");