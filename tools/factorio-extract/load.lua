-- Runs Factorio's data stage (core + base) outside the game and leaves the
-- result in the global `data.raw`, the same table the game builds at startup.
-- usage: dofile("load.lua") with arg[1] = Factorio's data directory.
local DATA = arg[1]

-- Shims for the parts of Factorio's Lua 5.2 environment the prototypes touch.
unpack = unpack or table.unpack
math.pow = math.pow or function(a, b) return a ^ b end
log = function() end
local function deep()
  return setmetatable({}, {__index = function(t, k) local v = deep(); rawset(t, k, v); return v end})
end
defines = deep()
local info = io.open(DATA .. "/base/info.json"):read("a")
mods = {base = info:match('"version"%s*:%s*"([^"]+)"')}
settings = {startup = {}}
feature_flags = {}

-- require() resolves "__mod__/path" and plain module names like the game does:
-- relative to the mod being loaded, then core/lualib.
local current_mod_dir
local function searcher(name)
  local mod, rest = name:match("^__(.-)__/(.*)$")
  local rel = (rest or name):gsub("%.lua$", "")
  local dirs = mod and {DATA .. "/" .. mod} or {current_mod_dir, DATA .. "/core/lualib"}
  for _, d in ipairs(dirs) do
    for _, p in ipairs({d .. "/" .. rel .. ".lua", d .. "/" .. rel:gsub("%.", "/") .. ".lua"}) do
      local f = io.open(p)
      if f then f:close() return loadfile(p) end
    end
  end
  return "\n\tnot found: " .. name
end
package.searchers = {package.searchers[1], searcher}

dofile(DATA .. "/core/lualib/dataloader.lua")
data.is_demo = false
local function run(mod)
  current_mod_dir = DATA .. "/" .. mod
  -- Each mod has its own prototypes/ tree, so forget relative modules between mods.
  for k in pairs(package.loaded) do if k:match("^prototypes") then package.loaded[k] = nil end end
  dofile(current_mod_dir .. "/data.lua")
end
run("core")
run("base")
return data
