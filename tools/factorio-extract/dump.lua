-- usage: lua dump.lua <factorio data dir> <load.lua> <out.json> <files.txt>
dofile(arg[2])
local raw = data.raw

local SELECT = {
  ["transport-belt"]="*", ["underground-belt"]="*", ["splitter"]="*", ["loader"]={"loader","fast-loader","express-loader"},
  ["inserter"]="*", ["assembling-machine"]="*", ["furnace"]="*", ["mining-drill"]="*",
  ["pipe"]="*", ["pipe-to-ground"]="*", ["pump"]="*", ["storage-tank"]="*", ["offshore-pump"]="*",
  ["boiler"]="*", ["generator"]="*", ["solar-panel"]="*", ["accumulator"]="*", ["electric-pole"]="*",
  ["radar"]="*", ["lab"]="*", ["container"]={"wooden-chest","iron-chest","steel-chest"}, ["beacon"]="*",
  ["ammo-turret"]="*", ["electric-turret"]="*", ["fluid-turret"]="*", ["artillery-turret"]="*",
  ["wall"]="*", ["gate"]="*", ["land-mine"]="*",
  ["unit"]="*", ["unit-spawner"]="*", ["turret"]="*",  -- turret = worms
  ["resource"]="*", ["tile"]="*", ["tree"]={"tree-01","tree-02","tree-03","tree-05","tree-09","dead-tree-desert"},
  ["simple-entity"]={"rock-big","rock-huge","sand-rock-big"},
  ["projectile"]="*", ["stream"]="*", ["beam"]={"laser-beam"},
  ["explosion"]={"explosion","small-explosion","medium-explosion","big-explosion","massive-explosion","explosion-hit","explosion-gunshot","laser-bubble","blood-explosion-small","blood-explosion-big","blood-explosion-huge","acid-splash-fire-worm-small","acid-splash-fire-spitter-small"},
  ["corpse"]="*", ["fire"]={"fire-flame"}, ["sticker"]={"acid-sticker-small","fire-sticker"},
  ["item"]="*", ["ammo"]="*", ["gun"]="*", ["capsule"]="*", ["module"]="*", ["tool"]="*", ["fluid"]="*", ["recipe"]="*",
  ["item-group"]="*", ["item-subgroup"]=nil,
}
-- corpses are many; keep only those referenced by selected entities
local KEEP_TOP = {type=1,name=1,collision_box=1,selection_box=1,drawing_box=1,tile_width=1,tile_height=1,icon_size=1,icon_mipmaps=1,
  direction_count=1,speed=1,belt_speed=1,animation_speed_coefficient=1,max_health=1,order=1,subgroup=1,corpse=1,dying_explosion=1,
  run_animation=1,attack_parameters=1,starting_attack_speed=1,folding_speed=1,preparing_speed=1,rotation_speed=1,
  base_color=1,flow_color=1,fluid_box=1,fluid_boxes=1,place_result=1,stack_size=1,size=1,variants=1,layer=1,map_color=1,
  frame_count=1,light=1,crafting_speed=1,mining_speed=1,movement_speed=1,distance_per_frame=1}

local files = {}
local function fixpath(s)
  local mod, rest = s:match("^__(%w+)__/(.*)$")
  if mod then local p = mod.."/"..rest; files[p]=true; return p end
  return s
end

local function hasgfx(v, seen)
  if type(v)=="string" then return v:match("%.png$")~=nil end
  if type(v)~="table" then return false end
  seen = seen or {} if seen[v] then return false end seen[v]=true
  for k,x in pairs(v) do if hasgfx(x, seen) then return true end end
  return false
end

local function isarray(t)
  local n=0 for k in pairs(t) do n=n+1 end
  for i=1,n do if t[i]==nil then return false end end
  return n>0
end

local function clean(v, depth)
  if type(v)=="string" then return v:match("%.png$") and fixpath(v) or v end
  if type(v)~="table" then return v end
  if depth>40 then return nil end
  if v.hr_version then v = v.hr_version end  -- prefer high-res (scale 0.5)
  local out = {}
  if isarray(v) then
    for i,x in ipairs(v) do out[i] = clean(x, depth+1) end
  else
    for k,x in pairs(v) do
      if type(k)=="string" and k~="hr_version" and type(x)~="function" and not (type(x)=="string" and x:match("%.ogg$")) then
        if type(x)~="table" or hasgfx(x) or depth>0 then
          if not (type(x)=="table" and depth>0 and not hasgfx(x) and (k:match("sound") or k=="action" or k=="working_sound")) then
            out[k] = clean(x, depth+1)
          end
        end
      end
    end
  end
  return out
end

local function pick(proto)
  local out = {}
  for k,x in pairs(proto) do
    if KEEP_TOP[k] then out[k] = clean(x,1)
    elseif type(x)=="string" and x:match("%.png$") then out[k] = fixpath(x)
    elseif type(x)=="table" and hasgfx(x) and not k:match("sound") then out[k] = clean(x,1) end
  end
  return out
end

local wanted = {}
for t,sel in pairs(SELECT) do
  if raw[t] and t~="corpse" then
    for name,p in pairs(raw[t]) do
      local ok = sel=="*"
      if type(sel)=="table" then for _,n in ipairs(sel) do if n==name then ok=true end end end
      if t=="tile" and name:match("^lab%-") then ok=false end
      if ok then wanted[t]=wanted[t] or {}; wanted[t][name]=pick(p) end
    end
  end
end
-- referenced corpses/remnants
wanted.corpse = {}
for t,m in pairs(wanted) do for _,p in pairs(m) do
  local c = p.corpse
  for _,cn in ipairs(type(c)=="table" and c or {c}) do
    if type(cn)=="string" and raw.corpse[cn] then wanted.corpse[cn] = pick(raw.corpse[cn]) end
  end
end end

-- JSON encoder
local function esc(s) return '"'..s:gsub('[%c"\\]', function(c) local m={['"']='\\"',['\\']='\\\\',['\n']='\\n',['\t']='\\t'} return m[c] or string.format("\\u%04x", c:byte()) end)..'"' end
local function enc(v, ind)
  local tv=type(v)
  if tv=="string" then return esc(v)
  elseif tv=="number" then
    if v~=v or v==math.huge or v==-math.huge then return "null" end
    if math.type(v)=="integer" or v==math.floor(v) and math.abs(v)<1e15 then return string.format("%d", math.floor(v)) end
    return string.format("%.10g", v)
  elseif tv=="boolean" then return tostring(v)
  elseif tv=="table" then
    local ni = ind.."  "
    if isarray(v) then
      local parts={} for i,x in ipairs(v) do parts[i]=enc(x, ni) end
      local s = "["..table.concat(parts, ",").."]"
      if #s < 100 and not s:find("\n") then return s end
      return "[\n"..ni..table.concat(parts, ",\n"..ni).."\n"..ind.."]"
    end
    local keys={} for k in pairs(v) do keys[#keys+1]=tostring(k) end table.sort(keys)
    if #keys==0 then return "{}" end
    local parts={} for _,k in ipairs(keys) do parts[#parts+1]=esc(k)..": "..enc(v[k], ni) end
    return "{\n"..ni..table.concat(parts, ",\n"..ni).."\n"..ind.."}"
  end
  return "null"
end

local manifest = {
  _meta = {
    source = "Factorio "..mods.base.." base/core data (Wube Software). Local use only; do not commit or redistribute.",
    path_root = "Paths are relative to this manifest (public/assets/factorio/).",
    resolution = "hr_version sprites are inlined in place of normal-res ones where Factorio provides them; such sprites carry scale=0.5.",
    units = "shift and boxes are in tiles (1 tile = 32 px at scale 1, i.e. 64 hr px).",
  },
  prototypes = wanted,
}
local f = io.open(arg[3], "w") f:write(enc(manifest, "")) f:close()
local g = io.open(arg[4], "w") local list={} for p in pairs(files) do list[#list+1]=p end table.sort(list) g:write(table.concat(list,"\n").."\n") g:close()
local n=0 for t,m in pairs(wanted) do for _ in pairs(m) do n=n+1 end end
print("prototypes", n, "files", #list)
